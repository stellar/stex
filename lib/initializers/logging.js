var Initializer     = require("../initializer");
var util            = require("util");
var _               = require("lodash");

/**
 * This logging subsystem is setup to format any logging data as json.  By default,
 * the ouput target will humanize the json (using json-log-humanizer) such that
 * it is readable by humans on the console, but in cases where we are writing the
 * logs to files we will store them as json for easier programmatic access
 */

Initializer.add('startup', 'stex.logging', ['stex.config', 'stex.cls'], function(stex) {
  stex.log = require("bristol");
  stex.log.setGlobal('hostname', require('os').hostname());
  stex.log.setGlobal('logId', require("uuid").v4());
  stex.log.setGlobal('version', require("../../../../package.json").version);
  // add the request id to every metadata element logged
  stex.log.addTransform(function (element) {
    // check this is a meta data element
    if (element.file) {
      element.requestId = stex.cls.get('requestId');
      return element;
    }
    return element;
  });

  setStexTarget(stex)
    .withFormatter('json')
    .withLowestSeverity(stex.conf.get("logLevel"));

  global.log = stex.log;
});

Initializer.add('startup', 'stex.request-logging', ['stex.express'], function(stex) {
  stex.app.use(function(req, res, next) {
    writeHttpLines(stex, req, res);
    next();
  });
});

function writeHttpLines(stex, req, res) {
  req._startAt       = process.hrtime();
  log.info("HTTP request", {
    path:    req.originalUrl || req.url,
    method: req.method,
    ip:     req.ip || req.connection.remoteAddress
  });

  function logResponse() {
    log.info("HTTP response", {
      status:   res._header ? res.statusCode : null,
      duration: requestDuration(req),
    });
  }

  res.once('finish', logResponse);
  res.once('close',  logResponse);
}

function requestDuration(req) {
  if (!req._startAt) {
    return -1.0; // unknown milliseconds
  }

  var diff = process.hrtime(req._startAt);
  // [seconds, nanoseconds]
  var ms = diff[0] * 1e3 + diff[1] * 1e-6;
  return ms;
}

function setStexTarget(stex) {
  var logTarget = stex.conf.get("logTarget");

  switch (logTarget){
    case "console":
      return stex.log.addTarget("console");
    case "syslog":
      var bristolSyslog = require('../util/bristol-syslog');
      return stex.log.addTarget(bristolSyslog.makeTarget(stex));
    case "humanizer":
      var humanizer = require('../util/json-log-humanizer');
      return stex.log.addTarget(humanizer.target);
    case "loggly":
      return stex.log.addTarget('loggly', {
        token: stex.conf.get("logglyApiToken"),
        subdomain: stex.conf.get("logglySubdomain"),
        tags: [
          stex.conf.get("appName")
        ]
      });
    default:
      throw new Error("Invalid logging target: " + util.inspect(logTarget));
  }
}

