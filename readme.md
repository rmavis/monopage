# MONOPAGE

This module helps manage URL and element state and user history
for a single-page site.


## Usage

Basic usage will involve links that look something like this:
```
<a class="link-in" href="/page" target="elem-id">click me</a>
```

And this:
```
<a class="link-out" href="http://other.site/page">click me</a>
```

And a call to `Monopage.init` that looks something like this:
```
Monopage.init(document.getElementById('page-body').innerHTML,
              'page-body',
              false, false);
```

That `init` will correlate the current URL with the element ID'd
`page-body` and that element's `innerHTML`, and set that state as
the user's first history entry. In other words, when that URL is
the current URL, then that element will contain that content. The
two `false` parameters indicate (1) that no external function
needs to be called with this content to recreate this page state,
and (2) if a function did need to be called to create this state,
that it doesn't need to be called right now.

The `link-in` class on a link element specifies that the link is
an inbound link, meaning that the return from its `href` should
be treated as a new element of the monopage. That return will be
filled into the element ID'd by the link's `target` attribute.

The `link-out` class indicates that the link should get a
`target="_blank"` attribute rather than a `click` event listener,
and that the link is not one acts upon the monopage.

More complex usage could involve an init that looks like:
```
Monopage.init(document.getElementById('page-data').innerHTML,
              false,
              'handler', true);
```

And links that look like:
```
<a class="link-in" href="/data" onreturn="handler">click me</a>
```

That `init` will act in much the same way as the other one but,
rather than replace the innerHTML of the `page-data` element, it
will pass an object to the `handler` function, and it will run
that function as part of the `init` process.


## Dependencies

- [Http.js](https://github.com/rmavis/http) for handling the HTTP requests
- [Clattr.js](https://github.com/rmavis/clattr) for handling the element attributes
- [Utils.js](https://github.com/rmavis/utils.js) for utility functions

Monopage.js is designed such that these dependencies should be
easy to replace, in case another tool can provide the required
functionality. Search, e.g., `Http`, to see where it is used and
what a replacement would involve.


## Details

Monopage correlates a URL with some data, a target element, and a
function name, collectively a "state". With each push and pop of
the history, that state gets reinstated: its URL becomes the one
in the bar, its `body` gets filled to the target element, and its
function is called with the state object as the parameter.

That state object will contain four keys:
- `url`: being the current URL
- `body`: being the content that the URL returned
- `target_id`: being the ID of the target element
- `action`: being the name of the function

If the `action` is not named, then the `body` will become the
`innerHTML` of the element ID'd by the `target_id`.

If a URL relates to only one element -- meaning that a change of
the URL should change only one element on the page -- then this
library should be sufficient (links should specify a `target`,
then that target will get filled with the response). But if a
page change involves more elements, custom functionality will
need to be added, preferably externally. To link Monopage to
other functions/modules, name a function in a link's `onreturn`
attribute.

There are six public methods: `init`, `click`, `touch`, `pop`, `setConf`,
and `resetConf`.

When the page first loads, `init` must fire. You need to add a
call to that somewhere and pass it appropriate values. It will
(1) save the current page data and URL, (2) add event listeners
to inbound links, and (3) add attributes to outbound links.

After that, inbound links will trigger on `click`, which will
(1) add an entry to the window history, (2) perform an AJAX call
to the specified URL, (3) correlate and save the URL and returned
data, (4) handle the returned data appropriately.

When the user clicks the back or forward button, `pop` will fire,
which will (1) receive the state object, (2) check if the state's
URL and corresponding data is stored, and (3) if it is, it will
recreate that state from the stored data, but if it isn't, then
the `click` routine will run, all except for its first step.

Each state object in the `window.history` stack is an object that
contains three keys:
- `url`, being the URL
- `target_id`, being the ID of the element that should receive the
  content associated with the URL
- `action`, being the name of the function to call when this URL is
  the current URL

The main data store is an object correlating a URL (the object's
keys) with the data the server provides for that URL (the values).

The URL/response data is stored in a variable rather than the
history's state object because browsers set a size limit on what
can be stored in the state object. Variables have no such limit.
Also, this way there is no persistence: if the user closes the
tab or refreshes the page, the data will be refreshed when they
visit again. Also, browsers vary their implementation of the
sessionStorage and localStorage APIs, and dealing with those
differences doesn't sound like fun.

For more info, see:
https://developer.mozilla.org/en-US/docs/Web/API/History_API

You can change the configuration settings from the defaults at
any time by passing an object with the right key/value pairs to
`setConf`. And you can reset to the defaults via `resetConf`.

There are three global variables:
- `url_cache`, being an object correlating URLs with the data those
  URLs fetch from the server.
- `conf`, being an object that contains configuration settings.
  Each entry is explained there.
- `bk_conf`, being a backup of the default configuration settings
  in case you change then via `setConf`.
