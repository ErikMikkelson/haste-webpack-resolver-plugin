const _ = require("lodash");
const fs = require("fs");
const resolvePath = require("path").resolve;
var path = require('path');
var createInnerCallback = require('enhanced-resolve/lib/createInnerCallback');

/* eslint-disable no-console */

const providesModulePattern = /@providesModule\s(\S+)/;

function HastePlugin(options) {
  this.include = options.include;
  this.exclude = options.exclude;

  this.modules = _discover(options);
}
module.exports = HastePlugin;

HastePlugin.prototype.apply = function(resolver) {
  var modules = this.modules;

  resolver.plugin('before-described-resolve', function(request, callback) {
    var innerRequest = request.request;
    if(!innerRequest) return callback();

    var module = modules[innerRequest]
    if(!module) return callback();

    var obj = Object.assign({}, request, {
      request: module
    });
    return resolver.doResolve("resolve", obj, "aliased with mapping '" + innerRequest + "' to '" + module + "'", createInnerCallback(function(err, result) {
      if(arguments.length > 0) return callback(err, result);

      // don't allow other aliasing or raw request
      callback(null, null);
    }, callback));

  });
};

function _discover(options) {
  this.options = options;
  this.modules = {};

  console.log("Crawling File System");
  console.time("Crawling File System (Elapsed)");

  _.each(options.include, path => _walkTree(path));

  console.timeEnd("Crawling File System (Elapsed)");

  return this.modules;
}

function _walkTree(path) {
  const stat = fs.statSync(path);

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(path);

    _.each(entries, entry => {
      if (!_isInExcludeList(entry)) {
        _walkTree(resolvePath(path, entry));
      }
    });

    return;
  }

  if (!stat.isFile() || !path.endsWith(".js")) {
    return;
  }

  const content = fs.readFileSync(path, "utf-8");
  const parts = content.match(providesModulePattern);
  if (!parts) {
    return;
  }

  const moduleName = parts[1];
  const existingModulePath = this.modules[moduleName];
  if (existingModulePath && existingModulePath !== path) {
    const lines = [
      `Duplicated module ${moduleName}`,
      `    ${existingModulePath}`,
      `    ${path}`
    ];

    console.error(lines.join("\n"));

    return;
  }

  this.modules[moduleName] = path;
}

function _isInExcludeList(path) {
  return _.some(this.options.exclude, entry => {
    return !_.isNil(path.match(entry));
  });
}