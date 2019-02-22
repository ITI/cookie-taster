var script_cookie_hashes = {};

function onStartedDownload(id) {
    console.log(`Started downloading: ${id}`);
}

function onFailed(error) {
    console.log(`Download failed: ${error}`);
}

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9\.]/gi, '_').toLowerCase();
}

function download(data, fname) {
    var blob = new Blob([data], {type: 'application/javascript'})
    var blob_url = URL.createObjectURL(blob);

    var downloading = browser.downloads.download({
          url : blob_url,
          filename : sanitizeFilename(fname),
          conflictAction : 'uniquify',
    });

    //console.log(sanitizeFilename(fname));

    downloading.then(onStartedDownload, onFailed);
}

function removeHeader(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].name.toLowerCase() == name) {
      headers.splice(i, 1);
      break;
    }
  }
}

browser.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.url in script_cookie_hashes) {
      console.log('Removing cookies for : ' + details.url);
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

  filter.ondata = event => {
    let str = decoder.decode(event.data, {stream: true});
    if (!(details.url in script_cookie_hashes)){
      script_cookie_hashes[details.url] = str;
      // trigger second download of the same script
      
      browser.tabs.sendMessage(details.tabId, {'url': details.url});
    } else if (details.url in script_cookie_hashes) {
      // check for differences and write to console
      if (str != script_cookie_hashes[details.url]) {
        download(str, details.url + ".no_cookie")
        download(script_cookie_hashes[details.url], details.url + ".cookie")
      }
    } 
    filter.write(encoder.encode(str));
    filter.disconnect();
  }

  return {};
}

function new_frame(details) {
  script_cookie_hashes = {}
}


browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: ["<all_urls>"], types: ["script"]},
  ['blocking']
);

browser.webRequest.onBeforeRequest.addListener(
  new_frame,
  {urls: ["<all_urls>"], types: ["main_frame"]},
  ['blocking']
);

