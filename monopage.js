/*
 * MONOPAGE
 *
 * This module manages the user's history on a single-page site.
 *
 *
 * USAGE
 *
 * Typical usage will involve links that look something like:
 * <a class="link-in" href="/page" onreturn="handler" target="elem-id">click me</a>
 *
 * The `link-in` class specifies that this link is an inbound link,
 * meaning that the return from its `href` should be treated as a
 * new element of the monopage. That return will get passed to the
 * function named in `onreturn`. If the response needs to be put in
 * an element, that element will be ID'd by the `target` attribute.
 *
 * But not all links must be inbound. Links to other sites should
 * look something like:
 * <a class="link-out" href="/page">click me</a>
 *
 * The `link-out` class indicates that this link, rather than a
 * `click` event listener, should get a `target="_blank"` attribute.
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
 * There are four public methods: init, click, touch, and pop.
 *
 * When the page first loads, `init` will fire. This method will
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
 * The main data store is an object correlating a URL (the object's
 * keys) with an object containing a `body` -- which can be HTML, a
 * JS object, etc -- and a `func`, being a function to pass the
 * `body` to.
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
 * - url_data: an object correlating URLs (the keys) with the data
 *   returned from those URLs (the values)
 * - current_link: the HTML element that triggered the call to
 *   Monopage
 * - current_url: the current URL. Needs to be a global variable so
 *   the `url_data` entry can be filled after the AJAX request.
 * - verbose: a boolean indicating whether you want to see messages
 *   in your console.
 * - conf: which names configuration settings. Each entry is
 *   explained there.
 *
 */

var Monopage = (function () {


    /*
     * Configuration.
     */

    var conf = {
        // The default method to call on `pop`. Each entry in `url_data`
        // can have its own reinstater, but if none is specified, then
        // this is used.
        default_reinstater: putInTarget,

        // The default element for filling with new page data. Each
        // link can specify its own target ID (see `elem_target_attr`)
        // but, if it doesn't, then this ID will be used.
        default_target_id: 'map-canvas',

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



    var url_data = { },
        current_url = null,
        current_link = null,
        verbose = true;



    // For the first entry, use replaceState. If you use pushState,
    // there will be one too many entries in the array.
    function setInitialState(url, content, func) {
        var entry = makeUrlEntry(url, content, func);
        current_url = entry.url;

        if (verbose) {
            console.log("Init: setting first history entry for " + current_url);
        }

        window.history.replaceState(current_url, '', current_url);
    }



    function makeUrlEntry(url, content, func) {
        func = (typeof func == 'function') ? func : conf.default_reinstater;

        var fixed_url = fixUrl(url);

        var state_obj = {
            body: content,
            func: func
        }

        url_data[fixed_url] = state_obj;

        return {
            url: fixed_url,
            state: state_obj
        };
    }



    function urlDataStored(url) {
        if (url in url_data) {
            if (verbose) {
                console.log("Checking '" + url + "': exists in store.");
            }

            return url_data[url];
        }
        else {
            if (verbose) {
                console.log("Checking '" + url + "': doesn't exist in store.");
            }

            return false;
        }
    }



    function touchLinksInRegion(element) {
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
            console.log("Adding '" + event_type + "' listeners to " + m + " objects.");
        }

        for (var o = 0; o < m; o++) {
            list[o].addEventListener(event_type, func, false);
        }
    }



    function setOutbound(list) {
        Clattr.add(list, '_blank', 'target');
    }



    function getElemFromTarget(tagname, referent) {
        var elem = referent;

        while ((!elem.tagName) && (elem.tagName != tagname)) {
            elem = elem.parentNode;
        }

        return elem;
    }



    // When this occurs, it's the start of history being made.
    function handleClick(event) {
        if (verbose) {
            console.log("Handling click.");
        }

        event.preventDefault();

        var ref = (event.target) ? event.target : event.srcElement;
        current_link = getElemFromTarget('a', ref);
        var fixed_url = fixUrl(current_link.getAttribute('href'));

        if (verbose) {
            console.log("Adding history entry for " + fixed_url);
        }

        window.history.pushState(fixed_url, '', fixed_url);

        if (state_obj = urlDataStored(fixed_url)) {
            makeStateCurrent(fixed_url, state_obj);
        }
        else {
            requestAndHandle(fixed_url);
        }
    }



    // This occurs onpopstate, so no history should be pushed.
    function handlePop(event) {
        if ((event.state) && (state_obj = urlDataStored(fixUrl(event.state)))) {
            if (verbose) {
                console.log("Popping: " + event.state + " from store.");
            }

            makeStateCurrent(fixUrl(event.state), state_obj);
        }
        else {
            if (verbose) {
                console.log("Popping: " + window.location.href + " from server.");
            }

            requestAndHandle(window.location.href);
        }
    }



    function requestAndHandle(url) {
        current_url = url;

        if (verbose) {
            console.log("Sending GET request to " + url);
        }

        Http.get({url: url, callback: handleResponse});
    }



    function handleResponse(response) {
        if (typeof conf.response_transform == 'function') {
            response = conf.response_transform(response);
        }

        var func = ((current_link) && (fx = current_link.getAttribute(conf.elem_handler_attr)))
            ? Utils.stringToFunction(fx)
            : conf.defaultReinstater;
        var body = (conf.response_key_body) ? response[conf.response_key_body] : response;

        var entry = makeUrlEntry(current_url, body, func);

        if (verbose) {
            console.log("Adding entry for " + current_url + " to store.");
            console.log("Current store:");
            console.log(url_data);
        }

        entry.state.func(entry.state.body);
    }



    function makeStateCurrent(url, state_obj) {
        current_url = url;

        if (state_obj.func) {
            state_obj.func(state_obj.body);
        }
        else {
            conf.default_reinstater(state_obj.body);
        }
    }



    function getCurrentTarget() {
        if (current_link) {
            if (id = current_link.getAttribute(conf.elem_target_attr)) {
                return document.getElementById(id);
            }
            else {
                return document.getElementById(conf.default_target_id);
            }
        }
        else {
            return document.getElementById(conf.default_target_id);
        }
    }



    function putInTarget(html_str) {
        if (verbose) {
            console.log("Placing data.");
        }

        var target = getCurrentTarget();
        target.innerHTML = html_str;
        touchLinksInRegion(target);
    }



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





    /*
     * Public methods.
     */
    return {

        init: function() {
            touchLinksInRegion(document);
            setInitialState(window.location.href,
                            JSON.parse(document.getElementById('map-data').innerHTML),
                            Map.plotPoints);
        },


        touch: function(element) {
            touchLinksInRegion(element);
        },


        click: function(evt) {
            handleClick(evt);
        },


        pop: function(evt) {
            handlePop(evt);
        }

    };
})();


window.onload = Monopage.init;
window.onpopstate = Monopage.pop;
