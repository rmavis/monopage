/*
 * MONOPAGE
 *
 * This module helps manage URL and element state and user history
 * for a single-page site.
 *
 *
 * USAGE
 *
 * Typical usage will involve links that look something like:
 * <a class="link-in" href="/page" target="elem-id">click me</a>
 *
 * The `link-in` class specifies that this link is an inbound link,
 * meaning that the return from its `href` should be treated as a
 * new element of the monopage. That return will be filled into the
 * element ID'd by the link's `target` attribute.
 *
 * But not all links must be inbound. Links to other sites should
 * look something like:
 * <a class="link-out" href="/page">click me</a>
 *
 * The `link-out` class indicates that this link, rather than a
 * `click` event listener, should get a `target="_blank"` attribute.
 *
 * If a URL relates to only one element -- meaning that a change of
 * the URL should change only one element on the page -- then this
 * library should be sufficient (links should specify a `target`,
 * then that target will get filled with the response). But if a
 * page comprises multiple elements, custom functionality will need
 * to be added. To link Monopage.js to other functions, name a
 * function in a link's `onreturn` attribute. After the request to
 * the link's `href` is made, that function will be passed an object
 * representing the current state. That object will contain the same
 * three elements as the object cached by Monopage along with a
 * `link` key which will contain the link that triggered the call.
 *
 *
 * DEPENDENCIES
 *
 * - Http.js for handling the HTTP requests
 * - Clattr.js for handling the element attributes
 * - Utils.js for various utility functions
 *
 *
 * DETAILS
 *
 * Monopage correlates a URL with some data, a target element, and a
 * function, collectively a *state*. With each push and pop of the
 * history stack, the state gets reinstated: its URL becomes the one
 * in the bar, its `body` gets filled to the target element, and its
 * function is called with its `body` as the parameter.
 *
 * There are four public methods: init, click, touch, and pop.
 *
 * When the page first loads, `init` must fire. You need to add a
 * call to that somewhere and pass it appropriate values. It will
 * (1) save the current page data and URL, (2) add event listeners
 * to inbound links, and (3) add attributes to outbound links that
 * will cause them to be opened in new tabs.
 *
 * After that, inbound links will trigger `click`, which will
 * (1) add an entry to the window history, (2) perform a GET request
 * to the specified URL, (3) correlate and save the URL and returned
 * data, (4) parse and handle the returned data appropriately.
 *
 * When the user clicks the back or forward button, `pop` will fire,
 * which will (1) receive the state object, (2) check if the state's
 * URL and corresponding data is stored, and (3) if it is, it will
 * recreate that state from the stored data, but if it isn't, then
 * the `click` routine will run, all except for its first step.
 *
 * Each state object in the `window.history` array is an object that
 * contains three keys:
 * - url: being the URL
 * - target_id: being the ID of the element that should receive the
 *   content associated with the URL
 * - action: being the name of the function to call when this URL is
 *   the current URL
 *
 * The main data store is an object correlating a URL (the object's
 * keys) with an object containing a `body` (which can be HTML, a JS
 * object, etc), a `target_id` of an element that should receive the
 * `body`, and an `action`, being a function to pass the `body` to.
 *
 * The URL/response data is stored in a variable rather than the
 * history's state object because browsers set a size limit on what
 * can be stored in the state object. Variables have no such limit.
 * Also, this way there is no persistence: if the user closes the
 * tab or refreshes the page, the data will be refreshed when they
 * visit again.
 *
 * For more info, see:
 * https://developer.mozilla.org/en-US/docs/Web/API/History_API
 *
 * There are five global variables:
 * - url_cache: an object correlating URLs (the keys) with the data
 *   returned from those URLs (the values)
 * - current_link: the HTML element that triggered the call to
 *   Monopage
 * - current_url: the current URL. Needs to be a global variable so
 *   the `url_cache` entry can be filled after the AJAX request.
 * - verbose: a boolean indicating whether you want to see messages
 *   in your console.
 * - conf: which names configuration settings. Each entry is
 *   explained there.
 *
 * The `current_` variables will be filled and nulled with each run
 * of action through `init`, `click`, or `pop`.
 *
 */

var Monopage = (function () {


    /*
     * Configuration.
     */

    var conf = {
        // The default element for filling with new page data. Each
        // link can specify its own target ID (see `elem_target_attr`)
        // but, if it doesn't, then this ID will be used. If this is
        // also false, then the content will be placed nowhere.
        default_target_id: false,

        // The default function to send the response body to when
        // the state is to be made current, whether after a link is
        // clicked or on pop. Each entry in `url_cache` can have its
        // own instater, but if none is specified, then this is used.
        // If false, then no action  will occur by default, and if the
        // link function is also missing, then nothing will occur :(
        // Should be a string.
        default_instater: false,

        // Each link can specify a function to handle the return from
        // the URL it calls. This names the attribute to read from the
        // link. The value of this attribute will be a function name.
        elem_handler_attr: 'onreturn',

        // Each link can name a target element ID to receive the return
        // from the URL it calls. This names the attribute to read from
        // the link.
        elem_target_attr: 'target',

        // During `init`, each inbound link will get an event listener
        // to handle clicks. This names the function that inbound links
        // will fire when they're clicked.
        link_action_inbound: handleClick,

        // This is the class name for inbound links. Links with this
        // class will get event listeners on `init` or when `touch`ed.
        link_class_inbound: 'link-in',

        // This is the class name for outbound links. Links with this
        // class will get `target="_blank"` attributes.
        link_class_outbound: 'link-out',

        // This is the class name for links that will not add entries
        // to the history cache. Their URLs will not become current.
        link_class_histless: 'hist-no',

        // This names the function that transforms the server response
        // before using it. If this doesn't name a function, then the
        // data won't be transformed. So if a transform isn't needed,
        // just make this `false`.
        response_transform: JSON.parse,

        // If the server response is an object, then this key needs to
        // name the key that contains the body. If the response is a
        // string, then just make this `false`.
        response_key_body: 'body'
    };



    var verbose = true,
        url_cache = { },
        async_keep = { };
    // It might be wise to make the async_keep entries arrays, or at least
    // to make a requested_urls array. It's conceivable that more than
    // one request can be made at a time.  #HERE



    // For the first entry, use replaceState. If you use pushState,
    // there will be one too many entries in the array.
    // Also, the `target_id` and `func` parameters are optional. But
    // if they are present, both should be strings.
    function setInitialState(url, body, target_id, func, call_func) {
        var state_obj = makeStateObject(url, body, target_id, func);

        if (verbose) {
            console.log("Replacing first history entry for '" + state_obj.url + "'.");
        }

        window.history.replaceState(prepStateForHistory(state_obj), '', state_obj.url);
        addBodyToCache(state_obj);

        // This is useful for cases in which the initial state is
        // set by the server, so the page is ready to go and needs
        // no modifications, but might want to use a function other
        // than the default for handling this state.
        if (call_func) {
            makeStateCurrent(state_obj, false);
        }
    }



    // Nulls for the `target_id` and `func` values will result in
    // their defaults being checked/used during instatement. Also,
    // this is the only place to add to the cache.
    function makeStateObject(url, body, target_id, func) {
        target_id = (typeof target_id == 'string') ? target_id : null;
        func = (typeof func == 'string') ? func : null;

        var state_obj = {
            target_id: target_id,
            url: fixUrl(url),
            action: func,
            body: body
        }

        return state_obj;
    }



    function makeStateObjectFromLink(link) {
        var url = link.getAttribute('href') || null;
        var func = link.getAttribute(conf.elem_handler_attr) || null;
        var target_id = link.getAttribute(conf.elem_target_attr) || null;

        return makeStateObject(url, null, target_id, func);
    }



    function addBodyToCache(state_obj) {
        url_cache[state_obj.url] = state_obj.body;

        if (verbose) {
            console.log("Adding entry to cache for '"+state_obj.url+"'.");
            console.log("Current cache:");
            console.log(url_cache);
        }
    }



    function getBodyFromCache(url) {
        if (url in url_cache) {
            if (verbose) {
                console.log("Checking '" + url + "': exists in cache.");
            }

            return url_cache[url];
        }

        else {
            if (verbose) {
                console.log("Checking '" + url + "': doesn't exist in cache.");
            }

            return false;
        }
    }



    function touchLinksInRegion(element) {
        if (verbose) {
            console.log("Checking the region's links.");
        }

        // For internal navigation.
        addListeners(element.getElementsByClassName(conf.link_class_inbound),
                     conf.link_action_inbound);

        // For outbound links.
        setOutbound(element.getElementsByClassName(conf.link_class_outbound));
    }



    function addListeners(list, func, event_type) {
        event_type = (typeof event_type == 'undefined') ? 'click' : event_type;
        var m = list.length;

        if (verbose) {
            console.log("Adding '" + event_type + "' listeners to " + m + " inbound links.");
        }

        for (var o = 0; o < m; o++) {
            list[o].addEventListener(event_type, func, false);
        }
    }



    function setOutbound(list) {
        if (verbose) {
            console.log("Adding '_blank' targets to outbound links.");
        }

        Clattr.add(list, '_blank', 'target');
    }



    function getElemFromTarget(tagname, referent) {
        var elem = referent;

        while ((!elem.tagName) && (elem.tagName != tagname)) {
            elem = elem.parentNode;
        }

        return elem;
    }



    // This occurs onpopstate, so no history should be pushed.
    function handlePop(event) {
        if ((event.state) && (body = getBodyFromCache(fixUrl(event.state.url)))) {
            if (verbose) {
                console.log("Popping '"+event.state.url+"' from cache.");
            }

            var state_obj = makeStateObject(event.state.url,
                                            body,
                                            event.state.target_id,
                                            event.state.action);
            makeStateCurrent(state_obj, false);
        }

        else if ((event.state.url) && (event.state.action)) {
            if (verbose) {
                console.log("Popping '"+event.state.url+"' from cache but need body from server.");
            }

            async_keep.state = event.state;
            async_keep.record = false;
            requestAndHandle(event.state.url);
        }

        else {
            if (verbose) {
                console.log("No information for '"+window.location.href+"'. Handling link as normal.");
            }

            requestAndHandle(window.location.href);
        }
    }



    function handleClick(event) {
        if (verbose) {
            console.log("Handling click.");
        }

        event.preventDefault();

        // The current link must be set here because it will be read
        // in `handleReturn`, after the request returns.
        var ref = (event.target) ? event.target : event.srcElement;
        var link = getElemFromTarget('a', ref);

        var fixed_url = fixUrl(link.getAttribute('href'));

        if (body = getBodyFromCache(fixed_url)) {
            if (verbose) {
                console.log("Got body for '" + fixed_url + "' from cache.");
            }

            var state_obj = makeStateObjectFromLink(link);
            state_obj.body = body;
            makeStateCurrent(state_obj, shouldMakeHistory(link));
        }

        else {
            if (verbose) {
                console.log("No entry for '" + fixed_url + "' in cache.");
            }

            async_keep.state = makeStateObjectFromLink(link);
            async_keep.record = shouldMakeHistory(link);
            requestAndHandle(fixed_url);
        }
    }



    function requestAndHandle(url) {
        if (verbose) {
            console.log("Sending GET request to " + url);
        }

        Http.get({url: url, callback: handleReturn});
    }



    // This builds an entry for the cache from the server response.
    function handleReturn(response) {
        if (typeof conf.response_transform == 'function') {
            response = conf.response_transform(response);
        }

        if (verbose) {
            console.log("Handling server return:");
            console.log(response);
        }

        var body = (conf.response_key_body) ? response[conf.response_key_body] : response;

        if (async_keep.state) {
            async_keep.state.body = body;

            makeStateCurrent(async_keep.state, async_keep.record);
            addBodyToCache(async_keep.state);

            if (async_keep.state.target_id) {
                touchLinksInRegion(document.getElementById(async_keep.state.target_id));
            }

            clearAsync();
        }

        else {
            console.log("DISASTER: no state information retained prior to making AJAX call.");
        }
    }



    function makeStateCurrent(state_obj, record) {
        if (verbose) {
            console.log("Making this state the current state:");
            console.log(state_obj);
        }

        var target = getStateTarget(state_obj);
        var func = getStateAction(state_obj);

        if (record) {
            pushStateToHistory(state_obj);
        }

        if (target) {
            if (verbose) {
                console.log("Filling target with state body.");
            }

            target.innerHTML = state_obj.body;
        }

        if (func) {
            if (verbose) {
                console.log("Calling return function '"+func+"' with state object.");
            }

            var fx = Utils.stringToFunction(func);
            fx(state_obj);
        }
    }



    function getStateTarget(state_obj) {
        var target_id = null;

        if (state_obj.target_id) {
            target_id = document.getElementById(state_obj.target_id);
        }
        else if (conf.default_target_id) {
            target_id = document.getElementById(conf.default_target_id);
        }

        if (verbose) {
            if (target_id) {
                console.log("Using target ID '"+target_id+"' for current state.");
            }
            else {
                console.log("No target ID for current state.");
            }
        }

        return target_id;
    }



    function getStateAction(state_obj) {
        var func = null;

        if (state_obj.action) {
            func = state_obj.action;
        }

        else if (conf.default_instater) {
            if (typeof conf.default_instater == 'function') {
                func = String(conf.default_instater);
            }
            else if (typeof conf.default_instater == 'string') {
                func = conf.default_instater;
            }
        }

        if (verbose) {
            if (func) {
                console.log("Using return function '"+func+"' for current state.");
            }
            else {
                console.log("No return function for current state.");
            }
        }

        return func;
    }



    // This could probably be moved to Utils.  #HERE
    // This ensures the given URL starts with `http://`.
    function fixUrl(url) {
        // http:// == 0-6
        if (url.substring(0, 6) == window.location.origin.substring(0, 6)) {
            return url;
        }
        else {
            if (url[0] == '/') {
                return window.location.origin + url;
            }
            else {
                return window.location.origin + '/' + url;
            }
        }
    }



    function shouldMakeHistory(link) {
        var should = false;

        if (Clattr.has(link, conf.link_class_histless)) {
            if (verbose) {
                console.log("Should not add history entry for " + link.getAttribute('href'));
            }
        }

        else {
            if (verbose) {
                console.log("Should add history entry for " + link.getAttribute('href'));
            }

            should = true;
        }

        return should;
    }



    function prepStateForHistory(state_obj) {
        if (verbose) {
            console.log("Prepping state object for the history array.");
        }

        var entry = {
            target_id: state_obj.target_id,
            action: state_obj.action,
            url: state_obj.url
        };

        return entry;
    }



    function pushStateToHistory(state_obj) {
        if (verbose) {
            console.log("Adding history entry for " + state_obj.url);
        }

        window.history.pushState(prepStateForHistory(state_obj), '', state_obj.url);

        return true;
    }



    function clearAsync() {
        if (verbose) {
            console.log("Clearing async-keep object.");
        }

        async_keep = { };
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
        }

    };
})();

window.onpopstate = Monopage.pop;

// The `window.onload` function should be set elsewhere. It should
// call `Monopage.init` with the appropriate parameters.
