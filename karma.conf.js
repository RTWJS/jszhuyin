// Karma configuration
// Generated on Fri Jan 01 2021 01:41:34 GMT-0800 (Pacific Standard Time)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['qunit'],


    client: {
      qunit: {
        showUI: true,
        testTimeout: 100 * 1E3
      }
    },

    // list of files / patterns to load in the browser
    files: [
      'test/util.js',
      'test/resources/testdata.data.arr.js',
      'lib/bopomofo_encoder.js',
      'lib/jszhuyin_data_pack.js',
      'lib/storage.js',
      'lib/data_loader.js',
      'lib/jszhuyin.js',
      'lib/client.js',
      'lib/web.js',
      'test/unit/*.js',

      'test/task_runner.js',
      'node_modules/chai/chai.js',
      'test/interaction/test_web.js',

      { pattern: 'test/**', included: false },
      { pattern: 'lib/**', included: false }
    ],


    // list of files / patterns to exclude
    exclude: [
    ],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['spec'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['ChromeHeadless', 'Firefox'],


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultaneous
    concurrency: Infinity
  })
}
