/**
 * Module dependencies.
 */

var mssql = require('mssql');
var thunk = require('./thunkify');
var _ = require('underscore');

/**
 * Expose util, extend from util module
 *
 */
var util = exports = module.exports = require('util');

/**
 * Sleep
 *
 * @param  {Number} ms milliseconds
 * 
 * @public
 *
 * @return {Function}
 */
util.sleep = function (ms) {
    return function (cb) {
        setTimeout(cb, ms);
    };
}

/**
 * Rand a number bewteen range
 *
 * @param  {Number} min
 * @param  {Number} max
 *
 * @public
 *
 * @return {Number}
 */
util.rand = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Represent one minute
 *
 * @type {Number}
 */
util.ONEMIN = 60 * 1000;

/**
 * Create a connection for MSSQL
 *
 * @param {Object} database configuration
 *
 * @public
 * 
 * @return {Connection}
 */
util.createConnection = function * (config) {
    var connection = new mssql.Connection(config);
    var connect = thunk(connection.connect, connection);

    yield connect;

    return connection;
}

/**
 * Create a Query for MSSQL
 *
 * @param {Object | Connection} database configuration or Connection
 *  
 * @public
 *
 * @return {Function} thunk function of Query
 */
util.createQuery = function * (config) {
    var connection;
    if (config instanceof mssql.Connection) {
        connection = config;
    } else {
        connection = yield util.createConnection(config);
    }
    var request = connection.request();

    return thunk(request.query, request);
}
