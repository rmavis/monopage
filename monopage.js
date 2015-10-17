/*
 * MONOPAGE
 *
 * This module helps manage URL and element state and user history
 * for a single-page site.
 *
 *
 * USAGE
 *
 * Basic usage will involve links that look something like this:
 * <a class="link-in" href="/page" target="elem-id">click me</a>
 *
 * And this:
 * <a class="link-out" href="http://other.site/page">click me</a>
 *
 * And a call to `Monopage.init` that looks something like this:
 * Monopage.init(document.getElementById('page-body').innerHTML,
 *               'page-body',
 *               false, false);
 *
 * That `init` will correlate the current URL with the element ID'd
 * `page-body` and that element's `innerHTML`, and set that state as
 * the user's first history entry. In other words, when that URL is
 * the current URL, then that element will contain that content. The
 * two `false` parameters indicate (1) that no external function
 * needs to be called with this content to recreate this page state,
 * and (2) if a function did need to be called to create this state,
 * that it doesn't need to be called right now.
 *
 * The `link-in` class on a link element specifies that the link is
 * an inbound link, meaning that the return from its `href` should
 * be treated as a new element of the monopage. That return will be
 * filled into the element ID'd by the link's `target` attribute.
 *
 * The `link-out` class indicates that the link should get a
 * `target="_blank"` attribute rather than a `click` event listener,
 * and that the link is not one acts upon the monopage.
 *
 * More complex usage could involve an init that looks like:
 * Monopage.init(document.getElementById('page-data').innerHTML,
 *               false,
 *               'handler', true);
 *
 * And links that look like:
 * <a class="link-in" href="/data" onreturn="handler">click me</a>
 *
 * That `init` will act in much the same way as the other one but,
 * rather than replace the innerHTML of the `page-data` element, it
 * will pass an object to the `handler` function, and it will run
 * that function as part of the `init` process.
 *
 *
 * DEPENDENCIES
 *
 * - Http.js for handling the HTTP requests
 * - Clattr.js for handling the element attributes
 * - Utils.js for utility functions
 *
 * Monopage.js is designed such that these dependencies should be
 * easy to replace, in case another tool can provide the required
 * functionality. Search, e.g., `Http`, to see where it is used and
 * what a replacement would involve.
 *
 *
 * DETAILS
 *
 * Monopage correlates a URL with some data, a target element, and a
 * function name, collectively a *state*. With each push and pop of
 * the history, that state gets reinstated: its URL becomes the one
 * in the bar, its `body` gets filled to the target element, and its
 * function is called with the state object as the parameter.
 *
 * That state object will contain four keys:
 * - url: being the current URL
 * - body: being the content that the URL returned
 * - target_id: being the ID of the target element
 * - action: being the name of the function
 *
 * If the `action` is not named, then the `body` will become the
 * `innerHTML` of the element ID'd by the `target_id`.
 *
 * If a URL relates to only one element -- meaning that a change of
 * the URL should change only one element on the page -- then this
 * library should be sufficient (links should specify a `target`,
 * then that target will get filled with the response). But if a
 * page change involves more elements, custom functionality will
 * need to be added, preferably externally. To link Monopage to
 * other functions/modules, name a function in a link's `onreturn`
 * attribute.
 *
 * There are six public methods: init, click, touch, pop, setConf,
 * and resetConf.
 *
 * When the page first loads, `init` must fire. You need to add a
 * call to that somewhere and pass it appropriate values. It will
 * (1) save the current page data and URL, (2) add event listeners
 * to inbound links, and (3) add attributes to outbound links.
 *
 * After that, inbound links will trigger on `click`, which will
 * (1) add an entry to the window history, (2) perform an AJAX call
 * to the specified URL, (3) correlate and save the URL and returned
 * data, (4) handle the returned data appropriately.
 *
 * When the user clicks the back or forward button, `pop` will fire,
 * which will (1) receive the state object, (2) check if the state's
 * URL and corresponding data is stored, and (3) if it is, it will
 * recreate that state from the stored data, but if it isn't, then
 * the `click` routine will run, all except for its first step.
 *
 * Each state object in the `window.history` stack is an object that
 * contains three keys:
 * - url, being the URL
 * - target_id, being the ID of the element that should receive the
 *   content associated with the URL
 * - action, being the name of the function to call when this URL is
 *   the current URL
 *
 * The main data store is an object correlating a URL (the object's
 * keys) with the data the server provides for that URL (the values).
 *
 * The URL/response data is stored in a variable rather than the
 * history's state object because browsers set a size limit on what
 * can be stored in the state object. Variables have no such limit.
 * Also, this way there is no persistence: if the user closes the
 * tab or refreshes the page, the data will be refreshed when they
 * visit again. Also, browsers vary their implementation of the
 * sessionStorage and localStorage APIs, and dealing with those
 * differences doesn't sound like fun.
 *
 * For more info, see:
 * https://developer.mozilla.org/en-US/docs/Web/API/History_API
 *
 * You can change the configuration settings from the defaults at
 * any time by passing an object with the right key/value pairs to
 * `setConf`. And you can reset to the defaults via `resetConf`.
 *
 * There are three global variables:
 * - url_cache, being an object correlating URLs with the data those
 *   URLs fetch from the server.
 * - conf, being an object that contains configuration settings.
 *   Each entry is explained there.
 * - bk_conf, being a backup of the default configuration settings
 *   in case you change then via `setConf`.
 *
 */

var Monopage = (function () {

    // This is the default configuration. These settings can be
    // modified any time by passing an object with these keys to the
    // public `setConf` method.
    var conf = {
        // The default element for filling with new page data. Each
        // link can specify its own target ID (see `link_attr_target`)
        // but, if it doesn't, then this ID will be used. If this is
        // also false, then the content will be placed nowhere.
        default_target_id: false,

        // The default function to send the response body to when
        // the state is to be made current, whether after a link is
        // clicked or on pop. Each entry in `url_cache` can have its
        // own action, but if none is specified, then this is used.
        // If false, then no action will occur by default, and if the
        // link function is also missing, then nothing will occur :(
        // This should be a string.
        default_action: false,

        // Each link can name a function to handle the return from the
        // `href` it calls. This names the attribute to read from the
        // link.
        link_attr_action: 'onreturn',

        // Each link can name a target element ID to receive the return
        // from the URL it calls. This names the attribute to read from
        // the link.
        link_attr_target: 'target',

        // This is the class name for inbound links. Links with this
        // class will get event listeners on `init` or when `touch`ed.
        link_class_inbound: 'link-in',

        // This is the class name for outbound links. Links with this
        // class will get outbound attributes.
        link_class_outbound: 'link-out',

        // The name of the attribute to add to outbound links. Make
        // this false to leave them alone.
        outbound_attr_name: 'target',

        // If this is not set, then the outbound attribute will not
        // be set at all.
        outbound_attr_value: '_blank',

        // This is the class name for links that will run through the
        // Monopage procedures but will not get pushed to the history
        // stack. Their URLs will not become current, their actions
        // will not run on back/forward clicks, etc., but they will
        // still be added to the `url_cache`.
        link_class_nohist: 'nohist',

        // If a link has this class, the click and pop procedure will
        // run as normal but the server return won't be cached. So
        // each click and pop will send a request.
        link_class_nocache: 'nocache',

        // This names the function that transforms the server response
        // before using it. If this doesn't name a function, then the
        // data won't be transformed. So if a transform isn't needed,
        // just make this false.
        response_transform: JSON.parse,

        // If the server response is an object, then this key needs to
        // name the key that contains the body. But if the response is
        // a string, just make this false.
        response_key_body: 'body',

        // This number specifies the maximum number of entries allowed
        // in the `url_cache`. If it is 0, no cache will be stored.
        // If it is negative, everything will be stored. Else, the
        // last `conf.cache` entries will be stored.
        cache: -1,

        // If this is true, then Monopage will write messages to the
        // console that allow you to track its progress. If false,
        // it won't.
        log: true
    };



    var bk_conf = null,
        url_cache = { },
        async_keep = { };



    function makeNewConf(conf_obj) {
        if (conf.log) {
            console.log("Pulling new config settings from:");
            console.log(conf_obj);
        }

        bk_conf = conf;

        var new_conf = Utils.sieve(conf, conf_obj);

        if (conf.log) {
            console.log("New config settings:");
            console.log(new_conf);
        }

        conf = new_conf;

        return conf;
    }



    function resetConfToDefault() {
        if (bk_conf) {
            if (conf.log) {
                console.log("Resetting config to default.");
            }

            conf = bk_conf;
            bk_conf = null;
        }

        else {
            if (conf.log) {
                console.log("Would reset config to default but there is no backup of the defaults.");
            }
        }

        return conf;
    }



    // For the first entry, use replaceState. If you use pushState,
    // there will be one too many entries in the array.
    // Also, the `target_id` and `func` parameters are optional. But
    // if they are present, both should be strings.
    function setInitialState(url, body, target_id, func, call_func) {
        var state_obj = makeStateObject(url, body, target_id, func);

        if (conf.log) {
            console.log("Replacing first history entry for '" + state_obj.url + "'.");
        }

        window.history.replaceState(prepStateForHistory(state_obj), '', state_obj.url);

        if (conf.cache) {
            addBodyToCache(state_obj);
        }

        // This is useful for cases in which the initial state is
        // set by the server, so the page is ready to go and needs
        // no modification, but might want to use a function other
        // than the default for handling this state.
        if (call_func) {
            makeStateCurrent(state_obj, false);
        }
    }



    // Nulls for the `target_id` and `func` values will result in
    // their defaults being checked/used during instatement.
    function makeStateObject(url, body, target_id, func) {
        target_id = (typeof target_id == 'string') ? target_id : null;
        func = (typeof func == 'string') ? func : null;

        var state_obj = {
            target_id: target_id,
            url: Utils.prefixUrl(url),
            action: func,
            body: body
        }

        return state_obj;
    }



    // Pass this a link element.
    function makeStateObjectFromLink(link) {
        var url = link.getAttribute('href') || null;
        var func = link.getAttribute(conf.link_attr_action) || null;
        var target_id = link.getAttribute(conf.link_attr_target) || null;

        return makeStateObject(url, null, target_id, func);
    }



    // Pass this a state object and two optional booleans indicating
    // whether (1) the state should be recorded, and (2) whether the
    // return should be caches.
    function makeAsyncObject(state, record, cache) {
        record = ((typeof record != undefined) && (record)) ? true : false;

        if (typeof cache == undefined) {
            cache = (conf.cache == 0) ? false : true;
        }

        return {
            state: state,
            record: record,
            cache: cache
        }
    }



    // This procedure doesn't check if the given `state_obj.url` is
    // in the cache. The process of making a request, handling the
    // response, and adding to the cache only occurrs when the cache
    // doesn't contain the current URL.
    function addBodyToCache(state_obj) {
        var added = false;

        if (conf.cache < 0) {
            url_cache[state_obj.url] = state_obj.body;
            added = true;
        }

        else if (conf.cache > 0) {
            var cache_size = Object.keys(url_cache).length;

            if (cache_size < conf.cache) {
                url_cache[state_obj.url] = state_obj.body;
                added = true;
            }

            else if (cache_size >= conf.cache) {
                var n = (cache_size - conf.cache) + 1;

                if (conf.log) {
                    console.log("Removing entries from cache: over limit by "+n+".");
                }

                for (var o = 0; o < n; o++) {
                    var key = Object.keys(url_cache).shift();
                    delete url_cache[key];
                }
            }
        }

        else {
            if (conf.log) {
                console.log("Cache limit is 0. Not adding entry to cache for '"+state_obj.url+"'.");
            }
        }

        if (added && conf.log) {
            console.log("Adding entry to cache for '"+state_obj.url+"'.");
            console.log("Current cache:");
            console.log(url_cache);
        }
    }



    function getBodyFromCache(url) {
        if (url in url_cache) {
            if (conf.log) {
                console.log("Checking '" + url + "': exists in cache.");
            }

            return url_cache[url];
        }

        else {
            if (conf.log) {
                console.log("Checking '" + url + "': doesn't exist in cache.");
            }

            return false;
        }
    }



    function touchLinksInRegion(element) {
        if (conf.log) {
            console.log("Checking the region's links.");
        }

        // For internal navigation.
        if (conf.log) {
            console.log("Adding 'click' listeners to inbound links.");
        }

        Utils.addListeners(element.getElementsByClassName(conf.link_class_inbound),
                           handleClick);

        // For outbound links.
        if (conf.outbound_attr_name && conf.outbound_attr_value) {
            if (conf.log) {
                console.log("Adding '"+conf.outbound_attr_name+
                            "=\""+conf.outbound_attr_value+"\"' attributes to outbound links.");
            }

            Clattr.add(element.getElementsByClassName(conf.link_class_outbound),
                       conf.outbound_attr_value,
                       conf.outbound_attr_name);
        }
        else {
            if (conf.log) {
                console.log("Not adding attributes to outbound links.");
            }
        }
    }



    // This occurs onpopstate, so no history should be pushed.
    function handlePop(event) {
        if ((event.state) && (body = getBodyFromCache(event.state.url))) {
            if (conf.log) {
                console.log("Popping '"+event.state.url+"' from cache.");
            }

            var state_obj = makeStateObject(event.state.url,
                                            body,
                                            event.state.target_id,
                                            event.state.action);
            makeStateCurrent(state_obj, false);
        }

        else if (event.state.url) {
            if (event.state.target_id || event.state.action) {
                if (conf.log) {
                    console.log("Popping '"+event.state.url+"' from history but need body from server.");
                }

                async_keep[event.state.url] = makeAsyncObject(event.state, false);
                requestAndHandle(event.state.url);
            }

            else {
                if (conf.log) {
                    console.log("No state for '"+event.state.url+"'. Handling URL like linkless click.");
                }

                async_keep[event.state.url] = makeAsyncObject(makeStateObject(event.state.url));
                requestAndHandle(event.state.url);
            }
        }

        else {
            if (conf.log) {
                console.log("Major weirdness. Making the request, hoping for the best.");
            }

            async_keep[window.location.href] = makeAsyncObject(makeStateObject(window.location.href));
            requestAndHandle(window.location.href);
        }
    }



    function handleClick(event) {
        if (conf.log) {
            console.log("Handling click.");
        }

        event.preventDefault();

        var ref = (event.target) ? event.target : event.srcElement;
        var link = Utils.getNearestParent(ref, 'a');

        var fixed_url = Utils.prefixUrl(link.getAttribute('href'));

        if (body = getBodyFromCache(fixed_url)) {
            if (conf.log) {
                console.log("Got body for '" + fixed_url + "' from cache.");
            }

            var state_obj = makeStateObjectFromLink(link);
            state_obj.body = body;
            makeStateCurrent(state_obj, shouldMakeHistory(link));
        }

        else {
            if (conf.log) {
                console.log("No entry for '" + fixed_url + "' in cache.");
            }

            async_keep[fixed_url] = (makeAsyncObject(makeStateObjectFromLink(link),
                                                     shouldMakeHistory(link),
                                                     shouldCache(link)));
            requestAndHandle(fixed_url);
        }
    }



    function requestAndHandle(url) {
        if (conf.log) {
            console.log("Sending GET request to " + url);
        }

        Http.get({url: url, callback: handleReturn, send_url: true});
    }



    function handleReturn(response, url) {
        if (conf.log) {
            console.log("Handling server return from '"+url+"':");
            console.log(response);
        }

        if (typeof conf.response_transform == 'function') {
            response = conf.response_transform(response);
        }

        var body = (conf.response_key_body) ? response[conf.response_key_body] : response;

        if (async_keep[url]) {
            async_keep[url].state.body = body;

            makeStateCurrent(async_keep[url].state, async_keep[url].record);

            if (async_keep[url].cache) {
                addBodyToCache(async_keep[url].state);
            }

            if (async_keep[url].state.target_id) {
                touchLinksInRegion(document.getElementById(async_keep[url].state.target_id));
            }

            delete async_keep[url];
        }

        else {
            console.log("DISASTER: no state retained for '"+url+"' prior to making AJAX call.");
        }

    }



    function makeStateCurrent(state_obj, record) {
        if (conf.log) {
            console.log("Making this state the current state:");
            console.log(state_obj);
        }

        var target = getStateTarget(state_obj);
        var func = getStateAction(state_obj);

        if (record) {
            pushStateToHistory(state_obj);
        }

        if (target) {
            if (conf.log) {
                console.log("Filling target with state body.");
            }

            target.innerHTML = state_obj.body;
        }

        if (func) {
            if (conf.log) {
                console.log("Calling return function '"+func+"' with state object.");
            }

            var fx = Utils.stringToFunction(func);
            fx(state_obj);
        }
    }



    function getStateTarget(state_obj) {
        var target = null,
            target_id = null;

        if (state_obj.target_id) {
            target_id = state_obj.target_id;
        }
        else if (conf.default_target_id) {
            target_id = conf.default_target_id;
        }

        if (target_id) {
            target = document.getElementById(target_id);
        }

        if (conf.log) {
            if (target) {
                console.log("Using target ID '"+target_id+"' for current state.");
            }
            else {
                console.log("No target ID for current state.");
            }
        }

        return target;
    }



    function getStateAction(state_obj) {
        var func = null;

        if (state_obj.action) {
            func = state_obj.action;
        }

        else if (conf.default_action) {
            if (typeof conf.default_action == 'string') {
                func = conf.default_action;
            }
            else if (typeof conf.default_action == 'function') {
                func = String(conf.default_action);
            }
            else {
                console.log("MAJOR MALFUNCTION: default action is neither a function nor a string.");
            }
        }

        if (conf.log) {
            if (func) {
                console.log("Using return function '"+func+"' for current state.");
            }
            else {
                console.log("No return function for current state.");
            }
        }

        return func;
    }



    function shouldCache(link) {
        var should = (conf.cache === 0) ? false : true;

        if (Clattr.has(link, conf.link_class_nocache)) {
            should = false;

            if (conf.log) {
                console.log("Should not cache state: link has '"+conf.link_class_nocache+"'.");
            }
        }

        else {
            if (conf.log) {
                if (should) {
                    console.log("Should cache state.");
                }
                else {
                    console.log("Should not cache state.");
                }
            }
        }

        return should;
    }



    function shouldMakeHistory(link) {
        var should = false;

        if (Clattr.has(link, conf.link_class_nohist)) {
            if (conf.log) {
                console.log("Should not add history entry for " + link.getAttribute('href'));
            }
        }

        else {
            if (conf.log) {
                console.log("Should add history entry for " + link.getAttribute('href'));
            }

            should = true;
        }

        return should;
    }



    function prepStateForHistory(state_obj) {
        if (conf.log) {
            console.log("Prepping state object for the history stack.");
        }

        var entry = {
            target_id: state_obj.target_id,
            action: state_obj.action,
            url: state_obj.url
        };

        return entry;
    }



    function pushStateToHistory(state_obj) {
        if (conf.log) {
            console.log("Adding history entry for " + state_obj.url);
        }

        window.history.pushState(prepStateForHistory(state_obj), '', state_obj.url);

        return true;
    }





    /*
     * Public methods.
     */
    return {

        init: function(body, target, func, call) {
            touchLinksInRegion(document);
            setInitialState(window.location.href, body, target, func, call);
        },

        click: function(evt) {
            handleClick(evt);
        },

        pop: function(evt) {
            handlePop(evt);
        },

        touch: function(element) {
            touchLinksInRegion(element);
        },

        setConf: function(new_conf) {
            return makeNewConf(new_conf);
        },

        resetConf: function() {
            return resetConfToDefault();
        }

    };
})();

window.onpopstate = Monopage.pop;

// The `window.onload` function should be set elsewhere. It should
// call `Monopage.init` with the appropriate parameters.
