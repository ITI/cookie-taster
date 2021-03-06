var resource_urls = {}, ignore_urls = [];
var request_headers = {}
var main_url;
const STOP_HEADER = "###";

function onStartedDownload(id) {
    console.log(`Started downloading: ${id}`);
}

function onFailed(error) {
    console.log(`Download failed: ${error}`);
}

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9\.]/gi, '_').toLowerCase();
}

function downloadListener(delta) {
  if (delta.state && delta.state.current === "complete") {
    console.log(`Download ${delta.id} ${delta.url} ${delta.filename} has completed.`);
  }
}

browser.downloads.onChanged.addListener(downloadListener);

function download(data, fname) {
    var blob = new Blob([data], {type: 'application/javascript'})
    var blob_url = URL.createObjectURL(blob);

    var downloading = browser.downloads.download({
          url : blob_url,
          filename : sanitizeFilename(fname),
          conflictAction : 'uniquify',
    });

    downloading.then(onStartedDownload, onFailed);
}

function containsHeader(headers, name) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() == name.toLowerCase()) {
      return true;
    }
  }
  return false;
}

function removeHeader(headers, name) {
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() == name.toLowerCase()) {
      headers.splice(i, 1);
      break;
    }
  }
}

function equal(buf1, buf2) {
  if (buf1.byteLength != buf2.byteLength) return false;
  var dv1 = new Int8Array(buf1);
  var dv2 = new Int8Array(buf2);
  for (let i = 0 ; i != buf1.byteLength ; i++)
  {
      if (dv1[i] != dv2[i]) return false;
  }
  return true;
}

function appendBuffer( buffer1, buffer2 ) {
  var tmp = new Uint8Array( buffer1.byteLength + buffer2.byteLength );
  tmp.set( new Uint8Array( buffer1 ), 0 );
  tmp.set( new Uint8Array( buffer2 ), buffer1.byteLength );
  return tmp.buffer;
}

browser.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    let previouslySeen = ((details.url in resource_urls) && Object.keys(resource_urls[details.url]).length >= 2);

    //check to see if initial request has headers, ignore if no
    if (!previouslySeen && !containsHeader(details.requestHeaders, 'cookie')) {
      ignore_urls.push(details.url);
    } else if (!previouslySeen) {
      console.log('First time w/ cookie! ' + details.url);
      if (!request_headers[details.url]) {
        request_headers[details.url] = {};
      }
      request_headers[details.url][details.requestId] = details.requestHeaders;
    } 

    if (previouslySeen) {
      console.log('Removing cookies for ' + details.type + ': ' + details.url);
      removeHeader(details.requestHeaders, 'cookie');
    }

    return {requestHeaders: details.requestHeaders};  
  },
  // filters
  {urls: ['<all_urls>']},
  // extraInfoSpec
  ['blocking', 'requestHeaders']);

function listener(details) {
  let filter = browser.webRequest.filterResponseData(details.requestId);
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();

  if (!(details.url in resource_urls)) {
    resource_urls[details.url] = {};
    resource_urls[details.url][details.requestId] = {
      'cookie': true,
      'type': details.type,
      'data': null
    };
  } else if (!(details.requestId in resource_urls[details.url])) {
    resource_urls[details.url][details.requestId] = {
      'cookie': false,
      'type': details.type,
      'data': null
    };
  }

  filter.ondata = event => {
    if (details.type == 'script' || details.type == 'stylesheet') {
      input = decoder.decode(event.data, {stream: true});
    } else {
      input = event.data;
    }

    first_packet = resource_urls[details.url][details.requestId]['data'] == null;   

    if (first_packet) {
      resource_urls[details.url][details.requestId]['data'] = input;
    } else {
      let dtype = resource_urls[details.url][details.requestId]['type'];
      if ((dtype == 'script') || (dtype == 'stylesheet')) {
        resource_urls[details.url][details.requestId]['data'] += input;
      } else {
        resource_urls[details.url][details.requestId]['data'] = appendBuffer(resource_urls[details.url][details.requestId]['data'], input);
      }
    }

    if (details.type == 'script' || details.type == 'stylesheet') {
      // prepend nonsense JS to prevent execution for secondary load
      if (details.type == 'script' && first_packet && Object.keys(resource_urls[details.url]).length == 2) {
        output = encoder.encode(STOP_HEADER + input);
      } else {
        output = encoder.encode(input);
      }
    } else {
      output = event.data;
    }    

    filter.write(output);
  }

  filter.onstop = event => {
    let keys = Object.keys(resource_urls[details.url])

    if (!resource_urls[details.url][details.requestId]['cookie']) {
      data1 = resource_urls[details.url][keys[0]]['data'];
      data2 = resource_urls[details.url][keys[1]]['data'];
      cookieStr1 = resource_urls[details.url][keys[0]]['cookie'] ? 'cookie' : 'no_cookie';
      cookieStr2 = resource_urls[details.url][keys[1]]['cookie'] ? 'cookie' : 'no_cookie';
      if (details.type == 'script' || details.type == 'stylesheet') {
        if(data1 != data2) {
          console.log(`Downloading ${details.url} ${details.type}`);
          download(data1, [main_url, details.url, details.type, cookieStr1].join('.'));
          download(data2, [main_url, details.url, details.type, cookieStr2].join('.'));
        } else {
          console.log("Cookie does not change content: " + details.url)
        }
      } else {
        if (!equal(data1, data2)) {
          console.log(`Downloading ${details.url} ${details.type}`);
          download(data1, [main_url, details.url, details.type, cookieStr1].join('.'));
          download(data2, [main_url, details.url, details.type, cookieStr2].join('.'));
        } else {
          console.log("Cookie does not change content: " + details.url)
        }
      }
    } else {
      if (!ignore_urls.includes(details.url)) {
        console.log("re-fetching " + details.type + " " + details.url);

        var info = {};

        if (details.type == 'xmlhttprequest') {
          info = {
            'method': details.method,
            'headers': request_headers[details.url][details.requestId],
            'body': details.requestBody
          }
        }

        browser.tabs.sendMessage(details.tabId, {
          'url': details.url,
          'type': details.type,
          'info': info, 
          'timeout': 100
        });
      }
    }
    filter.disconnect();
  }

  return {};
}

function new_frame(details) {
  console.log("Resetting resource urls");
  resource_urls = {};
  ignore_urls = [];
  main_url = details.url;
}


browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["<all_urls>"], types: ["script","stylesheet","media","object","image", "xmlhttprequest"]},
  ['blocking', 'requestBody']
);

browser.webRequest.onBeforeRequest.addListener(
  new_frame,
  {urls: ["<all_urls>"], types: ["main_frame"]},
  ['blocking']
);

