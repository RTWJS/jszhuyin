'use strict';

(function() {

  var debugging = false;
  var debug = function(str) {
    if (!debugging)
      return;
    if (window.dump)
      window.dump('JSZhuYing: ' + str + '\n');
    if (console && console.log) {
      console.log('JSZhuYing: ' + str);
      if (arguments.length > 1)
        console.log.apply(this, arguments);
    }
  };

  /* for non-Mozilla browsers */
  if (!KeyEvent) {
    var KeyEvent = {
      DOM_VK_BACK_SPACE: 0x8,
      DOM_VK_RETURN: 0xd
    };
  }

  var IMEngine = function() {
    var settings;

    var db;

    var syllablesInBuffer = [''];
    var pendingSymbols = ['', '', '', ''];
    var firstCandidate = '';
    var keypressQueue = [];
    var isWorking = false;

    var kBufferLenLimit = 8;
    var kDBTermMaxLength = 8;

    var SymbolType = {
      CONSTANT: 0,
      VOWEL1: 1,
      VOWEL2: 2,
      TONE: 3
    };

    /* ==== init functions ==== */

    var initDB = function ime_initDB(ready_callback) {
      var dbSettings = {
        wordsJSON: settings.path + '/words.json',
        phrasesJSON: settings.path + '/phrases.json'
      };

      if (ready_callback)
        dbSettings.ready = ready_callback;

      db = new IMEngineDatabase();
      db.init(dbSettings);
    }

    /* ==== helper functions ==== */

    var typeOfSymbol = function ime_typeOfSymbol(code) {

      var tones = [' ', '˙', 'ˊ', 'ˇ', 'ˋ'];

      /* ㄅ - ㄙ */
      if (code >= 0x3105 && code <= 0x3119)
        return SymbolType.CONSTANT;
      /* ㄧㄨㄩ */
      if (code >= 0x3127 && code <= 0x3129)
        return SymbolType.VOWEL1;
      /* ㄚ - ㄦ */
      if (code >= 0x311A && code <= 0x3126)
        return SymbolType.VOWEL2;
      /*  ˙ˊˇˋ */
      if (tones.indexOf(String.fromCharCode(code)) !== -1) {
        return SymbolType.TONE;
      }
      return false;
    };

    var empty = function ime_empty() {
      debug('Empty buffer.');
      syllablesInBuffer = [''];
      pendingSymbols = ['', '', '', ''];
      firstCandidate = '';
      isWorking = false;
      if (!db)
        initDB();
    };

    var lookup = function ime_lookup(syllables, type, callback) {
      switch (type) {
        case 'sentence':
          db.getSentences(
            syllables,
            function getSentences_callback(dbResults) {
              if (!dbResults) {
                callback([]);
                return;
              }
              var results = [];
              dbResults.forEach(
                function dbResults_forEach(sentence) {
                  var str = '';
                  sentence.forEach(
                    function sentence_forEach(term) {
                      str += term[0];
                    }
                  );
                  if (results.indexOf(str) === -1)
                    results.push(str);
                }
              );
              callback(results);
            }
          );
        break;
        case 'term':
          db.getTerms(
            syllables,
            function getTerms_callback(dbResults) {
              if (!dbResults) {
                callback([]);
                return;
              }
              var results = [];
              dbResults.forEach(
                function dbResults_forEach(term) {
                  results.push(term[0]);
                }
              );
              callback(results);
            }
          );
        break;
        default:
          debug('Error: no such lookup() type.');
        break;
      }
    };

    var updateCandidateList = function ime_updateCandidateList(callback) {
      debug('Update Candidate List.');

      if (!syllablesInBuffer.join('').length) {
        debug('Buffer is empty; send empty candidate list.');
        settings.sendChoices([]);
        callback();
        return;
      }

      var candidates = [];
      var syllablesForQuery = [].concat(syllablesInBuffer);

      if (
        pendingSymbols[SymbolType.TONE] === '' &&
        syllablesForQuery[syllablesForQuery.length - 1]
      ) {
        debug('Last syllable incomplete, add default tone.');
        // the last syllable is incomplete, add a default tone
        syllablesForQuery[syllablesForQuery.length - 1] =
          pendingSymbols.join('') + ' ';
      }

      debug('Get term candidates for the entire buffer.');
      lookup(
        syllablesForQuery,
        'term',
        function lookup_callback(results) {
          results.forEach(
            function results_forEach(result) {
              candidates.push([result, 'whole']);
            }
          );

          if (syllablesInBuffer.length === 1) {
            debug('Only one syllable; skip other lookups.');

            if (!candidates.length) {
              // candidates unavailable; output symbols
              candidates.push([syllablesInBuffer.join(''), 'whole']);
            }

            settings.sendChoices(candidates);
            firstCandidate = candidates[0][0];
            callback();
            return;
          }

          debug('Lookup for sentences that make up from the entire buffer');
          lookup(
            syllablesForQuery,
            'sentence',
            function lookup_callback(results) {
              results.forEach(
                function results_forEach(result) {
                  // look for candidate that is already in the list
                  var exists = candidates.some(
                    function candidates_some(candidate) {
                      return (candidate[0] === result);
                    }
                  );

                  if (exists)
                    return;

                  candidates.push([result, 'whole']);
                }
              );

              if (!candidates.length) {
                // no sentences nor terms for the entire buffer
                debug('Insert all symbols as the first candidate.');
                candidates.push([syllablesInBuffer.join(''), 'whole']);
              }
              firstCandidate = candidates[0][0];

              // The remaining candidates doesn't match the entire buffer
              // these candidates helps user find the exact character/term
              // s/he wants
              // The remaining unmatched syllables will go through lookup
              // over and over until the buffer is emptied.

              var i = Math.min(kDBTermMaxLength, syllablesInBuffer.length - 1);

              var findTerms = function lookup_findTerms() {
                debug(
                  'Lookup for terms that matches first ' + i + ' syllables.'
                );
                lookup(
                  syllablesForQuery.slice(0, i),
                  'term',
                  function lookup_callback(results) {
                    results.forEach(
                      function(result) {
                        candidates.push([result, 'term']);
                      }
                    );

                    if (!--i) {
                      debug('Done Looking.');
                      settings.sendChoices(candidates);
                      callback();
                      return;
                    }

                    findTerms();
                    return;
                  }
                );
              };

              findTerms();
            }
          );


        }
      );


    };

    /* ==== the keyQueue loop === */

    var next = function ime_next() {
      debug('Processing keypress');

      if (!db) {
        debug('DB not initialized, defer processing.');
        initDB(next);
        return;
      }
      if (!keypressQueue.length) {
        debug('keyQueue emptied.');
        isWorking = false;
        return;
      }

      var code = keypressQueue.shift();
      debug('key code: ' + code);

      if (code === KeyEvent.DOM_VK_RETURN) {
        // User pressed Return key
        debug('Return Key');
        if (!firstCandidate) {
          debug('Default action.');
          // pass the key to IMEManager for default action
          settings.sendKey(code);
          next();
          return;
        }

        // candidate list exists; output the first candidate
        debug('Sending first candidate.');
        settings.sendString(firstCandidate);
        settings.sendChoices([]);
        empty();
        next();
        return;
      }

      if (code === KeyEvent.DOM_VK_BACK_SPACE) {
        // User pressed backspace key
        debug('Backspace key');
        if (
          syllablesInBuffer.length === 1 &&
          syllablesInBuffer[0] === ''
        ) {
          // pass the key to IMEManager for default action
          debug('Default action.');
          settings.sendKey(code);
          next();
          return;
        }

        if (!pendingSymbols.join('')) {
          // pendingSymbols is empty; remove the last syllable in buffer
          debug('Remove last syllable.');
          syllablesInBuffer =
            syllablesInBuffer.slice(0, syllablesInBuffer.length - 1);
          syllablesInBuffer[syllablesInBuffer.length - 1] =
            pendingSymbols.join('');
          updateCandidateList(next);
          return;
        }

        debug('Remove pending symbols.');

        // remove the pendingSymbols
        pendingSymbols = ['', '', '', ''];
        syllablesInBuffer[syllablesInBuffer.length - 1] = '';
        updateCandidateList(next);
        return;
      }

      var type = typeOfSymbol(code);

      if (type === false) {
        // non Bopomofo code
        debug('Non-bopomofo code');

        if (firstCandidate) {
          // candidate list exists; output the first candidate
          debug('Sending first candidate.');
          settings.sendString(firstCandidate);
          settings.sendChoices([]);
          empty();

          // no return here
        }

        //pass the key to IMEManager for default action
        debug('Default action.');
        settings.sendKey(code);
        next();
        return;
      }

      var symbol = String.fromCharCode(code);

      debug('Processing symbol: ' + symbol);

      // add symbol to pendingSymbols
      pendingSymbols[type] = symbol;

      // update syllablesInBuffer
      syllablesInBuffer[syllablesInBuffer.length - 1] =
        pendingSymbols.join('');

      if (
        typeOfSymbol(code) === SymbolType.TONE &&
        (settings.bufferLenLimit || kBufferLenLimit) &&
        syllablesInBuffer.length >=
          (settings.bufferLenLimit || kBufferLenLimit)
      ) {
        // syllablesInBuffer is too long; find a term and sendString()
        debug('Buffer exceed limit');
        var i = syllablesInBuffer.length - 1;

        var findTerms = function ime_findTerms() {
          debug('Find term for first ' + i + ' syllables.');

          lookup(
            syllablesInBuffer.slice(0, i),
            'term',
            function lookup_callback(candidates) {
              if (i !== 1 && !candidates[0]) {
                // not found, keep looking
                i--;
                findTerms();
                return;
              }

              debug('Found.');

              // sendString
              settings.sendString(
                candidates[0] ||
                syllablesInBuffer.slice(0, i).join('')
              );

              // remove syllables from buffer
              while (i--) {
                syllablesInBuffer.shift();
              }

              updateCandidateList(
                function updateCandidateList_callback() {
                  // bump the buffer to the next character
                  syllablesInBuffer.push('');
                  pendingSymbols = ['', '', '', ''];

                  next();
                }
              );
            }
          );
        };

        findTerms();
        return;
      }

      updateCandidateList(
        function updateCandidateList_callback() {
          if (typeOfSymbol(code) === SymbolType.TONE) {
            // bump the buffer to the next character
            syllablesInBuffer.push('');
            pendingSymbols = ['', '', '', ''];
          }

          next();
        }
      );

    };

    /* ==== init ==== */

    this.init = function ime_init(options) {
      settings = options;
    };

    /* ==== uninit ==== */

    this.uninit = function ime_unload(code) {
      empty();
      db.uninit();
      db = null;
    };

    /* ==== interaction functions ==== */

    this.click = function ime_click(code) {
      debug('Click keyCode: ' + code);
      keypressQueue.push(code);
      if (!isWorking) {
        isWorking = true;
        debug('Start keyQueue loop.');
        next();
      }
    };


    this.select = function ime_select(text, type) {
      debug('Select text ' + text);
      settings.sendString(text);

      var i = text.length;
      while (i--) {
        syllablesInBuffer.shift();
      }

      if (!syllablesInBuffer.length) {
        syllablesInBuffer = [''];
        pendingSymbols = ['', '', '', ''];
      }

      updateCandidateList(function() {});
    };

    this.empty = empty;
  };

  var IMEngineDatabase = function() {
    var settings;

    /* name and version of IndexedDB */
    var kDBName = 'JSZhuYing';
    var kDBVersion = 6;

    var jsonData;
    var iDB;

    var iDBCache = {};
    var cacheTimer;
    var kCacheTimeout = 10000;

    var self = this;

    /* ==== init functions ==== */

    var getTermsInDB = function imedb_getTermsInDB(callback) {
      if (
        !window.mozIndexedDB || // No mozIndexedDB API implementation
        IDBDatabase.prototype.setVersion || // old version of IndexedDB API
        window.location.protocol === 'file:' // bug 643318
      ) {
        debug('IndexedDB is not available on this platform.');
        callback();
        return;
      }

      var req = mozIndexedDB.open(kDBName, kDBVersion);
      req.onerror = function dbopen_onerror(ev) {
        debug('Encounter error while opening IndexedDB.');
        callback();
      };
      req.onupgradeneeded = function dbopen_onupgradeneeded(ev) {
        debug('IndexedDB upgradeneeded.');
        iDB = ev.target.result;

        // delete the old ObjectStore if present
        if (iDB.objectStoreNames.length !== 0)
          iDB.deleteObjectStore('terms');

        // create ObjectStore
        iDB.createObjectStore(
          'terms',
          {
            keyPath: 'syllables'
          }
        );

        // no callback() here
        // onupgradeneeded will follow by onsuccess event
        return;
      };

      req.onsuccess = function dbopen_onsuccess(ev) {
        debug('IndexedDB opened.');
        iDB = ev.target.result;
        callback();
      };
    };

    var populateDBFromJSON = function imedb_populateDBFromJSON(callback) {
      var chunks = [];
      var chunk = [];
      var i = 0;

      for (var syllables in jsonData) {
        chunk.push(syllables);
        i++;
        if (i > 2048) {
          chunks.push(chunk);
          chunk = [];
          i = 0;
        }
      }
      chunks.push(chunk);
      chunks.push(['_last_entry_']);
      jsonData['_last_entry_'] = true;

      var addChunk = function imedb_addChunk() {
        debug(
          'Loading data chunk into IndexedDB, ' +
          (chunks.length - 1) + ' chunks remaining.'
        );

        var transaction = iDB.transaction('terms', IDBTransaction.READ_WRITE);
        var store = transaction.objectStore('terms');

        transaction.onerror = function req_onerror(ev) {
          debug('Problem while populating DB with JSON data.');
        };

        transaction.oncomplete = function req_oncomplete() {
          if (chunks.length) {
            setTimeout(addChunk, 0);
          } else {
            jsonData = null;
            setTimeout(callback, 0);
          }
        };

        var syllables;
        var chunk = chunks.shift();
        for (i in chunk) {
          var syllables = chunk[i];
          store.add(
            {
              syllables: syllables,
              terms: jsonData[syllables]
            }
          );
        }
      };

      setTimeout(addChunk, 0);
    };

    var getTermsJSON = function imedb_getTermsJSON(callback) {
      getWordsJSON(
        function getWordsJSON_callback() {
          getPhrasesJSON(callback);
        }
      );
    };

    var getWordsJSON = function imedb_getWordsJSON(callback) {
      var xhr = new XMLHttpRequest();
      xhr.open(
        'GET',
        (settings.wordsJSON || './words.json'),
        true
      );
      xhr.responseType = 'json';
      xhr.overrideMimeType('application/json; charset=utf-8');
      xhr.onreadystatechange = function xhr_onreadystatechange(ev) {
        if (xhr.readyState !== 4)
          return;

        if (typeof xhr.response !== 'object') {
          debug('Failed to load words.json: Malformed JSON');
          callback();
          return;
        }

        jsonData = {};
        // clone everything under response coz it's readonly.
        for (var s in xhr.response) {
          jsonData[s] = xhr.response[s];
        }
        xhr = null;

        callback();
      };

      xhr.send(null);
    };

    var getPhrasesJSON = function getPhrasesJSON(callback) {
      var xhr = new XMLHttpRequest();
      xhr.open(
        'GET',
        (settings.phrasesJSON || './phrases.json'),
        true
      );
      xhr.responseType = 'json';
      xhr.overrideMimeType('application/json; charset=utf-8');
      xhr.onreadystatechange = function xhr_onreadystatechange(ev) {
        if (xhr.readyState !== 4)
          return;

        if (typeof xhr.response !== 'object') {
          debug('Failed to load phrases.json: Malformed JSON');
          callback();
          return;
        }

        // clone everything under response coz it's readonly.
        for (var s in xhr.response) {
          jsonData[s] = xhr.response[s];
        }
        xhr = null;

        callback();
      };

      xhr.send(null);
    };

    /* ==== helper functions ==== */

    /*
    * Math function that return all possible compositions of
    * a given natural number
    * callback will be called 2^(n-1) times.
    *
    * ref: http://en.wikipedia.org/wiki/Composition_(number_theory)#Examples
    * also: http://stackoverflow.com/questions/8375439
    *
    */
    var compositionsOf = function imedb_compositionsOf(n, callback) {
      var x, a, j;
      x = 1 << n - 1;
      while (x--) {
        a = [1];
        j = 0;
        while (n - 1 > j) {
          if (x & (1 << j)) {
            a[a.length - 1]++;
          } else {
            a.push(1);
          }
          j++;
        }
        callback.call(this, a);
      }
    };

    /*
    * Data from IndexedDB gets to kept in iDBCache for kCacheTimeout seconds
    */
    var cacheSetTimeout = function imedb_cacheSetTimeout() {
      debug('Set iDBCache timeout.');
      clearTimeout(cacheTimer);
      cacheTimer = setTimeout(
        function imedb_cacheTimeout() {
          debug('Empty iDBCache.');
          iDBCache = {};
        },
        kCacheTimeout
      );
    };

    /* ==== init ==== */

    this.init = function imedb_init(options) {
      settings = options;

      var ready = function ready() {
        debug('Ready.');
        if (settings.ready)
          settings.ready();
      };

      if (settings.disableIndexedDB) {
        debug('IndexedDB disabled; Downloading JSON ...');
        getTermsJSON(ready);
        return;
      }

      debug('Probing IndexedDB ...');
      getTermsInDB(
        function getTermsInDB_callback() {
          if (!iDB) {
            debug('IndexedDB not available; Downloading JSON ...');
            getTermsJSON(ready);
            return;
          }

          var transaction = iDB.transaction('terms');

          var req = transaction.objectStore('terms').get('_last_entry_');
          req.onsuccess = function req_onsuccess(ev) {
            if (ev.target.result !== undefined) {
              ready();
              return;
            }

            debug('IndexedDB is supported but empty; Downloading JSON ...');
            getTermsJSON(
              function getTermsInDB_callback() {
                if (!jsonData) {
                  debug('JSON failed to download.');
                  return;
                }

                debug(
                  'JSON loaded,' +
                  'IME is ready to use while inserting data into db ...'
                );
                ready();
                populateDBFromJSON(
                  function getTermsInDB_callback() {
                    debug('IndexedDB ready and switched to indexedDB backend.');
                  }
                );
              }
            );
          };
        }
      );
    };

    /* ==== uninit ==== */

    this.uninit = function imedb_uninit() {
      if (iDB)
        iDB.close();
      jsonData = null;
    };

    /* ==== db lookup functions ==== */

    this.getTerms = function imedb_getTerms(syllables, callback) {
      if (!jsonData && !iDB) {
        debug('Database not ready.');
        callback(false);
        return;
      }

      var syllablesStr = syllables.join('-').replace(/ /g , '');

      debug('Get terms for ' + syllablesStr + '.');

      if (jsonData) {
        debug('Lookup in JSON.');
        callback(jsonData[syllablesStr] || false);
        return;
      }

      if (typeof iDBCache[syllablesStr] !== 'undefined') {
        debug('Lookup in iDBCache.');
        callback(iDBCache[syllablesStr]);
        return;
      }

      debug('Lookup in IndexedDB.');
      var req =
        iDB.transaction('terms', IDBTransaction.READ_ONLY)
        .objectStore('terms')
        .get(syllablesStr);

      req.onerror = function req_onerror(ev) {
        debug('Database read error.');
        callback(false);
      };

      req.onsuccess = function req_onsuccess(ev) {
        cacheSetTimeout();

        if (!ev.target.result) {
          iDBCache[syllablesStr] = false;
          callback(false);
          return;
        }

        iDBCache[syllablesStr] = ev.target.result.terms;
        callback(ev.target.result.terms);
      };
    };

    this.getTermWithHighestScore =
    function imedb_getTermWithHighestScore(syllables, callback) {
      self.getTerms(
        syllables,
        function getTerms_callback(terms) {
          if (!terms) {
            callback(false);
            return;
          }
          callback(terms[0]);
        }
      );
    }

    this.getSentences = function imedb_getSentences(syllables, callback) {
      var sentences = [];
      var n = 0;

      compositionsOf.call(
        this,
        syllables.length,
        /* This callback will be called 2^(n-1) times */
        function compositionsOf_callback(composition) {
          var str = [];
          var start = 0;
          var i = 0;

          var next = function composition_next() {
            var numOfWord = composition[i];
            if (composition.length === i)
              return finish();
            i++;
            self.getTermWithHighestScore(
              syllables.slice(start, start + numOfWord),
              function getTermWithHighestScore_callback(term) {
                if (!term)
                  return finish();
                str.push(term);
                start += numOfWord;
                next();
              }
            );
          };

          var finish = function composition_finish() {
            // complete; this composition does made up a sentence
            if (start === syllables.length)
              sentences.push(str);

            if (++n === (1 << (syllables.length - 1))) {
              cacheSetTimeout();

              sentences = sentences.sort(
                function sentences_sort(a, b) {
                  var scoreA = 0;

                  a.forEach(
                    function sentences_a_forEach(term) {
                      scoreA += term[1];
                    }
                  );

                  var scoreB = 0;
                  b.forEach(
                    function sentences_b_forEach(term) {
                      scoreB += term[1];
                    }
                  );

                  return (scoreB - scoreA);
                }
              );

              callback(sentences);
            }
          };

          next();
        }
      );
    };
  };

  // Expose to IMEManager
  IMEManager.IMEngines.jszhuying = new IMEngine();

})();
