const _ = require("lodash");
const fs = require("fs");
const resolvePath = require("path").resolve;
var assign = require('object-assign');
var basename = require('enhanced-resolve/lib/getPaths').basename;
var forEachBail = require('enhanced-resolve/lib/forEachBail');
var path = require('path');

/* eslint-disable no-console */

const providesModulePattern = /@providesModule\s(\S+)/;


module.exports = function (options) {
  var optionsToUse = (typeof options === 'boolean') ? { honorIndex: options } : (options || {});
  var {honorPackage: mainFields, exclude, include} = optionsToUse;
  // make roots array if not
  optionsToUse.roots = exclude && !Array.isArray(exclude) ? [exclude] : exclude;
  // make blacklist array if not
  optionsToUse.blacklist = include && !Array.isArray(include) ? [include] : include;
  return {
    apply: doApply.bind(this, optionsToUse),

    _discover,
    _walkTree,
    _isOnBlacklist

  };
};

function doApply(options, resolver) {
  // plugin name taken from: https://github.com/webpack/enhanced-resolve/blob/7df23d64da27cd76b09046f9b9ffd61480c0ddca/test/plugins.js
  resolver.plugin('before-existing-directory', function (request, callback) {

    var dirPath = request.path;
    var dirName = basename(dirPath);
    var attempts = [];

    // return if path matches with excludes
    if (options.blacklist && options.blacklist.some(exclude=> dirPath.search(blacklist) >= 0)) {
      return callback();
    }

    // return if path doesn't match with includes
    if (options.roots && !options.roots.some(include => dirPath.search(roots) >= 0)){
      return callback();
    }

    var modules = this._discover(options);

    forEachBail(
      attempts,

      function (reference, innerCallback) {
        var filePath = resolver.join(dirPath, modules[reference]);

        // approach taken from: https://github.com/webpack/enhanced-resolve/blob/master/lib/CloneBasenamePlugin.js#L21
        var obj = assign({}, request, {
          path: filePath,
          relativePath: request.relativePath &&
          resolver.join(request.relativePath, fileName)
        });

        // file type taken from: https://github.com/webpack/enhanced-resolve/blob/7df23d64da27cd76b09046f9b9ffd61480c0ddca/test/plugins.js
        resolver.doResolve('undescribed-raw-file', obj, 'using path: ' + filePath, wrap(innerCallback, fileName));
      },

      // function (fileName, innerCallback) {
      //   var filePath = resolver.join(dirPath, fileName);

      //   // approach taken from: https://github.com/webpack/enhanced-resolve/blob/master/lib/CloneBasenamePlugin.js#L21
      //   var obj = assign({}, request, {
      //     path: filePath,
      //     relativePath: request.relativePath &&
      //     resolver.join(request.relativePath, fileName)
      //   });

      //   // file type taken from: https://github.com/webpack/enhanced-resolve/blob/7df23d64da27cd76b09046f9b9ffd61480c0ddca/test/plugins.js
      //   resolver.doResolve('undescribed-raw-file', obj, 'using path: ' + filePath, wrap(innerCallback, fileName));
      // },

      function (result) {
        return result ? callback(null, result) : callback();
      }
    );
  });
}

// function wrap(callback, fileName) {
//   function wrapper(err, result) {
//     if (callback.log) {
//       callback.log("directory name file " + fileName);
//     }

//     return err === null && result ? callback(result) : callback();
//   }
//   wrapper.log = callback.log;
//   wrapper.stack = callback.stack;
//   wrapper.missing = callback.missing;
//   return wrapper;
// }


function _discover(options) {
  this.options = options;
  this.modules = {};

  console.log("Crawling File System");
  console.time("Crawling File System (Elapsed)");

  _.each(this.options.roots, path => this._walkTree(path));

  console.timeEnd("Crawling File System (Elapsed)");

  return this.modules;
}

function _walkTree(path) {
  const stat = fs.statSync(path);

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(path);

    _.each(entries, entry => {
      if (!this._isOnBlacklist(entry)) {
        this._walkTree(resolvePath(path, entry));
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

function _isOnBlacklist(path) {
  return _.some(this.options.blacklist, entry => {
    return !_.isNil(path.match(entry));
  });
}