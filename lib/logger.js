
/**
 * Module dependencies.
 */
var logan = require('logan');

logan.set({
  error: ['%', 'red'],
  success: ['%', 'green'],
  info: ['%', 'cyan']
})


/**
 * Expose logger.
 */
exports = module.exports = logan;