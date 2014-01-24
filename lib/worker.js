/**
 * Module dependencies.
 */
var debug = require('debug')('mssql:worker');
var co = require('co');
var mssql = require('co-mssql');
var logger = require('./logger');
var util = require('./util');
var rand = util.rand;

/**
 * Receive message from parent process and execute load test.
 * One child process represents one connection to specific database
 */
process.on('message', function (m) {
    //console.dir('message event');
    var config = m.config;
    co(function * () {
        var connection = new mssql.Connection(config);
        yield connection.connect();
        var request = connection.request();
        var max_w_id = yield getMaxWarehouseId(request);
        var max_d_id = yield getMaxDistrictId(request);
        var w_id = rand(1, max_w_id);
        var d_id = rand(1, max_d_id);

        while (1) {
            var choice = rand(1, 23);
            var request = connection.request();
            //request.verbose = true;
            // New-Order: 43.25%
            if (choice <= 10) {
                yield executeNEWORD(request, w_id, max_w_id);
                continue;
            }
            // Payment: 43.25%
            if (choice <= 20) {
                yield executePAYMENT(request, w_id, max_w_id);
                continue;
            }
            // Delivery: 4.35%
            if (choice <= 21) {
                yield executeDELIVERY(request);
                continue;
            }
            // Stock-Leve: 4.35%
            if (choice <= 22) {
                yield executeSLEV(request, w_id, d_id);
                continue;
            }
            //Order-Status: 4.35%
            if (choice <= 23) {
                yield executeOSTAT(request, w_id);
                continue;
            }
        }
    })();
});

function * getMaxWarehouseId(request) {
    return~~ (yield request.query('select max(w_id) from warehouse'))[0][''];
}

function * getMaxDistrictId(request) {
    return~~ (yield request.query('select max(d_id) from district'))[0][''];
}

// implement http://www.tpc.org/information/sessions/sigmod/sld011.htm
function nuRand(iConst, x, y, C) {
    return (((rand(0, iConst) | rand(x, y)) + C) % (y - x + 1)) + x;
}

// implement TPC-C: 4.3.2.3
function randomName(num) {
    var arr = ['BAR', 'OUGHT', 'ABLE', 'PRI', 'PRES', 'ESE', 'ANTI', 'CALLY', 'ATION', 'EING'];

    return util.format('%s%s%s', ~~ (num / 100), ~~ ((num % 100) / 10), num % 10);
}

/**
 * implement TPC-C: 2.4
 * The New-Order business transaction consists of entering a complete order through a single database transaction.
 */
function * executeNEWORD(request, w_id, max_w_id) {
    // district id
    var no_d_id = rand(1, 10);
    // customer id
    var no_c_id = rand(1, 3000);
    // count of items in the order
    var no_o_ol_cnt = rand(5, 15);

    request
        .input('no_w_id', mssql.Int, w_id)
        .input('no_max_w_id', mssql.Int, max_w_id)
        .input('no_d_id', mssql.Int, no_d_id)
        .input('no_c_id', mssql.Int, no_c_id)
        .input('no_o_ol_cnt', mssql.Int, no_o_ol_cnt)
        .input('timestamp', mssql.DateTime, new Date());

    yield request.execute('NEWORD');
}

/**
 * implement TPC-C: 2.5
 * The Payment business transaction updates the customer's balance and reflects the payment on the district and warehouse sales statistics.
 */
function * executePAYMENT(request, w_id, max_w_id) {
    var p_d_id = rand(1, 10);
    var x = rand(1, 100);
    var y = rand(1, 100);

    if (x <= 85) {
        var p_c_d_id = p_d_id;
        var p_c_w_id = w_id;
    } else {
        var p_c_d_id = rand(1, 10);
        var p_c_w_id = rand(1, max_w_id);
        while ((p_c_w_id === w_id) && max_w_id != 1) {
            p_c_w_id = rand(1, max_w_id);
        }
    }

    var name;
    var p_c_id = nuRand(1023, 1, 3000, 123);
    var byName;
    if (y <= 60) {
        var nu_rand = nuRand(255, 0, 999, 123);
        name = randomName(nu_rand);
        byname = 1;
    } else {
        byname = 0;
        name = '';
    }
    var p_h_amount = rand(1, 5000);

    request
        .input('p_w_id', mssql.Int, w_id)
        .input('p_d_id', mssql.Int, p_d_id)
        .input('p_c_w_id', mssql.Int, p_c_w_id)
        .input('p_c_d_id', mssql.Int, p_c_d_id)
        .input('p_c_id', mssql.Int, p_c_id)
        .input('byname', mssql.Int, byname)
        .input('p_h_amount', mssql.Numeric, p_h_amount)
        .input('p_c_last', mssql.Char, name)
        .input('timestamp', mssql.DateTime, new Date());

    yield request.execute('PAYMENT');
}

/**
 * implement TPC-C: 2.6
 * The Order-Status business transaction queries the status of a customer's last order.
 */
function * executeOSTAT(request, w_id) {
    var os_d_id = rand(1, 10);
    var y = rand(1, 100);
    var os_c_id = nuRand(1023, 1, 3000, 123);
    var byname;
    if (y <= 60) {
        var nu_rand = nuRand(255, 0, 999, 123);
        name = randomName(nu_rand);
        byname = 1;
    } else {
        byname = 0;
        name = '';
    }

    request
        .input('os_w_id', mssql.Int, w_id)
        .input('os_d_id', mssql.Int, os_d_id)
        .input('os_c_id', mssql.Int, os_c_id)
        .input('byname', mssql.Int, byname)
        .input('os_c_last', mssql.Char, name)

    yield request.execute('OSTAT');
}

/**
 * implement TPC-C: 2.7
 * The Delivery business transaction consists of processing a batch of 10 new (not yet delivered) orders. Each order is processed (delivered) in full within the scope of a read-write database transaction.
 */
function * executeDELIVERY(request, w_id) {
    var d_o_carrier_id = rand(1, 10);

    request
        .input('d_w_id', mssql.Int, w_id)
        .input('d_o_carrier_id', mssql.Int, d_o_carrier_id)
        .input('timestamp', mssql.DateTime, new Date());

    yield request.execute('DELIVERY');
}


/**
 * implement TPC-C: 2.8
 * The Stock-Level business transaction determines the number of recently sold items that have a stock level below a specified threshold.
 */
function * executeSLEV(request, w_id, d_id) {
    var threshold = rand(10, 20);

    request
        .input('st_w_id', mssql.Int, w_id)
        .input('st_d_id', mssql.Int, d_id)
        .input('threshold', mssql.Int, threshold);

    yield request.execute('SLEV');

}

function prepareStatement() {
    return {
        slev: "EXEC SLEV @st_w_id = ?, @st_d_id = ?, @threshold = ?",
        delivery: "EXEC DELIVERY @d_w_id = ?, @d_o_carrier_id = ?, @timestamp = ?",
        ostat: "EXEC OSTAT @os_w_id = ?, @os_d_id = ?, @os_c_id = ?, @byname = ?, @os_c_last = ?",
        payment: 'EXEC PAYMENT @p_w_id = ?, @p_d_id = ?, @p_c_w_id = ?, @p_c_d_id = ?, @p_c_id = ?, @byname = ?, @p_h_amount = ?, @p_c_last = ?, @timestamp =?',
        neword: 'EXEC NEWORD @no_w_id = ?, @no_max_w_id = ?, @no_d_id = ?, @no_c_id = ?, @no_o_ol_cnt = ?, @timestamp = ?'
    }
}