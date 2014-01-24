/**
 * Module dependencies.
 */

var fs = require('fs');
var path = require('path');
var logger = require('./logger');
var yaml = require('js-yaml');
var _ = require('underscore');
var debug = require('debug')('mssql:runner');
var cp = require('child_process');
var co = require('co');
var mssql = require('co-mssql');
var compose = require('./compose');
var thunk = require('./thunkify');
var util = require('./util');


// thunk
var writeFile = thunk(fs.writeFile);

/**
 * Expose runner
 */
var runner = exports = module.exports = {};

runner.init = function (jobSpec, outputDir) {
  this.jobSpec = jobSpec;
  this.outputDir = outputDir;
  this.config();
  this.run();
}

runner.config = function () {
  var content = fs.readFileSync(this.jobSpec, 'utf-8');
  var doc = yaml.safeLoad(content);

  this.config = doc.config;
  this.jobs = doc.jobs;
  this.middlewares = [];

  for (var i = 0, l = this.jobs.length; i < l; i++) {
    this.middlewares.push(runJob);
  }

  this.config.outputDir = this.outputDir;
  this.config.jobSpec = this.jobSpec;

  this.config.rampup = ~~this.config.rampup;
  this.config.duration = Math.min(~~this.config.duration, 1);
}

runner.run = function () {
  var ms = [respond].concat(this.middlewares);
  var gen = compose(ms);
  var fn = co(gen);

  var ctx = {
    jobs: _.clone(this.jobs),
    config: this.config,
    results: {}
  };

  fn.call(ctx, function (err) {
    if (!err) {
      return;
    }

    logger.error(err);
  });
}

function * runJob(next) {
  var job = this.jobs.shift();
  var config = this.config;
  var results = this.results;
  var databases = job.database_names.split(',');
  var vUsers = job.virtual_users;
  var childProcesses = [];
  var r = results[job.name] = results[job.name] || {};

  debug('[%s] started!', job.name);

  for (var i = 0, l = databases.length; i < l; i++) {
    for (var k = 0; k < vUsers; k++) {
      var dbConfig = config.database;
      dbConfig.database = databases[i];

      var p = cp.fork(__dirname + '/worker.js');

      //kick off worker
      p.send({
        config: dbConfig
      });
      childProcesses.push(p);
    }
  }

  debug('[%d workers] started!', childProcesses.length);

  // rampup
  yield rampup(config.rampup);

  // compute start tpm and tpmC
  var computeStartResult = yield compute(config.database, databases);

  // wait till test duration ends
  var duration = config.duration;
  var stTest = 0;
  debug('begin %d minutes load test at %s', duration, new Date());
  while (stTest < duration) {
    yield util.sleep(util.ONEMIN);
    debug('%d minutes load test complete...', ++stTest);
  }
  debug('%d minutes load test finished at %s', duration, new Date());

  // clean child processes
  for (var i = 0, l = childProcesses.length; i < l; i++) {
    childProcesses[i].kill();
  }

  // compute end tpm and tpmC
  var computeEndResult = yield compute(config.database, databases);

  for (var i = 0, l = databases.length; i < l; i++) {
    var db = databases[i];
    var s = computeStartResult[db];
    var e = computeEndResult[db]
    r[db] = r[db] || {};

    r[db].tpm = (~~(e.tpm - s.tpm)) / duration;
    r[db].tpmC = (~~(e.tpmC - s.tpmC)) / duration;
  }

  debug('[%s] finished!', job.name);

  // kick off next job
  yield next;
}

function * rampup(rampup) {
  var stRampup = 0;
  debug('begin %d minutes rampup starting at %s', rampup, new Date());
  while (stRampup < rampup) {
    yield util.sleep(util.ONEMIN);
    debug('%d minutes rampup complete...', ++stRampup);
  }
  debug('%d minutes rampup finished at %s', rampup, new Date());
}

function * compute(dbConfig, databases) {
  var result = {};
  var connection = new mssql.Connection(dbConfig);
  var request = connection.request();
  yield connection.connect();
  for (var i = 0, l = databases.length; i < l; i++) {
    dbConfig.database = databases[i];
    var tpm = yield getTPMByBatchRequest(request);
    var tpmC = yield getTPMC(request);

    result[databases[i]] = {
      tpm: tpm,
      tpmC: tpmC
    }
  }

  connection.close();

  return result;
}

function * respond(next) {
  yield * next;

  // write the result to output dir
  var outputDir = this.config.outputDir;
  var basename = path.basename(this.config.jobSpec, '.yml');
  yield writeFile(path.resolve(outputDir, util.format('%s_result_%s.yml', basename, new Date().valueOf())), yaml.safeDump(this.results));
}

function * getTPMByExecutionCount(request) {
  return~~ (yield request.query('select sum(execution_count) from sys.dm_exec_query_stats'))[0][''];
}

function * getTPMByBatchRequest(request) {
  return~~ (yield request.query('select cntr_value from sys.dm_os_performance_counters where counter_name = \'Batch Requests/sec\''))[0]['cntr_value'];
}

function * getTPMC(request) {
  return~~ (yield request.query('select sum(d_next_o_id) from district'))[0][''];
}