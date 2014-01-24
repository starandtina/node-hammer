/**
 * Module dependencies.
 */

var mssql = require('mssql');
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
