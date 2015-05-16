/**!
 * koa-locales - index.js
 *
 * Copyright(c) koajs and other contributors.
 * MIT Licensed
 *
 * Authors:
 *   fengmk2 <m@fengmk2.com> (http://fengmk2.com)
 */

"use strict";

/**
 * Module dependencies.
 */

var debug = require('debug')('koa-locales');
var util = require('util');
var fs = require('fs');
var path = require('path');
var ms = require('humanize-ms');

module.exports = function (app, options) {
  options = options || {};
  var defaultLocale = formatLocale(options.defaultLocale || 'en-US');
  var queryField = options.queryField || 'locale';
  var cookieField = options.cookieField || 'locale';
  var cookieMaxAge = ms(options.cookieMaxAge || '1y');
  var localeDir = options.dir || path.join(process.cwd(), 'locales');
  var functionName = options.functionName || '__';
  var resources = {};

  if (fs.existsSync(localeDir)) {
    var names = fs.readdirSync(localeDir);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!/\.(js|json)$/.test(name)) {
        continue;
      }
      var filepath = path.join(localeDir, name);
      // support en_US.js => en-US.js
      var locale = formatLocale(name.split('.')[0]);
      resources[locale] = require(filepath);
    }
  }

  debug('init locales with %j, got %j resources', options, Object.keys(resources));

  var ARRAY_INDEX_RE = /\{(\d+)\}/g;
  function formatWithArray(text, values) {
    return text.replace(ARRAY_INDEX_RE, function (orignal, matched) {
      var index = parseInt(matched);
      if (index < values.length) {
        return values[index];
      }
      // not match index, return orignal text
      return orignal;
    });
  }

  app.context[functionName] = function (key, value, value2, value3, value4) {
    if (arguments.length === 0) {
      // __()
      return '';
    }

    var locale = this.__getLocale();
    var resource = resources[locale] || {};
    var text = resource[key] || key;
    debug('%s: %j => %j', locale, key, text);
    if (!text) {
      return '';
    }

    // for performance reason
    if (arguments.length === 1) {
      // __(key)
      return text;
    }
    if (arguments.length === 2) {
      if (Array.isArray(value)) {
        // __(key, array)
        // __('{0} {1} {1} {0}', ['foo', 'bar'])
        // =>
        // foo bar bar foo
        return formatWithArray(text, value);
      }

      // __(key, value)
      return util.format(text, value);
    }
    if (arguments.length === 3) {
      // __(key, value1, value2)
      return util.format(text, value, value2);
    }
    if (arguments.length === 4) {
      // __(key, value1, value2, value3)
      return util.format(text, value, value2, value3);
    }
    if (arguments.length === 5) {
      // __(key, value1, value2, value3, value4)
      return util.format(text, value, value2, value3, value4);
    }

    // __(key, value1, value2, value3, value4, value5, ...)
    var args = Array.prototype.slice.call(arguments, 1);
    args.unshift(text);
    return util.format.apply(util, args);
  };

  // 1. query: /?locale=en-US
  // 2. cookie: locale=zh-TW
  // 3. header: Accept-Language: zh-CN,zh;q=0.5
  app.context.__getLocale = function () {
    if (this.__locale) {
      return this.__locale;
    }

    var cookieLocale = this.cookies.get(cookieField);
    var locale = this.query[queryField] || cookieLocale;
    if (!locale) {
      // Accept-Language: zh-CN,zh;q=0.5
      // Accept-Language: zh-CN
      var languages = this.acceptsLanguages();
      if (languages) {
        if (Array.isArray(languages)) {
          if (languages[0] === '*') {
            languages = languages.slice(1);
          }
          if (languages.length > 0) {
            for (var i = 0; i < languages.length; i++) {
              var lang = formatLocale(languages[i]);
              if (resources[lang]) {
                locale = lang;
                break;
              }
            }
            if (!locale) {
              // set the first one
              locale = languages[0];
            }
          }
        } else {
          locale = languages;
        }
      }

      // all missing, set it to defaultLocale
      if (!locale) {
        locale = defaultLocale;
      }
    }

    locale = formatLocale(locale);

    // validate locale
    if (!resources[locale]) {
      locale = defaultLocale;
    }

    if (cookieLocale !== locale) {
      // locale change, need to set cookie
      this.cookies.set(cookieField, locale, {
        // make sure brower javascript can read the cookie
        httpOnly: false,
        maxAge: cookieMaxAge,
      });
    }
    this.__locale = locale;
    return locale;
  };

  function formatLocale(locale) {
    // support zh_CN, en_US => zh-CN, en-US
    return locale.replace('_', '-').toLowerCase();
  }
};