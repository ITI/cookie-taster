browser.runtime.onMessage.addListener(injectScript);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function injectScript(request, sender, sendResponse) {
  timeout = 'timeout' in request ? request['timeout'] : 0 

  sleep(timeout).then(() => {
    if (request['type'] == 'script') {
    var s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = request['url'];
      document.body.appendChild(s);   
    } else if (request['type'] == 'stylesheet') {
      var s = document.createElement('link');
      s.rel  = 'stylesheet';
      s.type = 'text/css';
      s.href = request['url'];
      document.body.appendChild(s);   
    } else if (request['type'] == 'image') {
      var i = document.createElement('img');
      i.src = request['url'];
      i.style = "display:none;";
      document.body.appendChild(i);   
    } else if (request['type'] == 'media') {
      var video = document.createElement('video');
      video.src = request['url'];
      video.style = "display:none;";
      document.body.appendChild(video);
    } else if (request['type'] == 'object') {
      var obj = document.createElement('object');
      obj.data = request['url'];
      obj.style = "display:none;";
      document.body.appendChild(obj);
    } else if (request['type'] == 'xmlhttprequest') {
      var req = new XMLHttpRequest();
      req.open(request['info']['method'], request['url'], true);
      var headers = request['info']['headers'];
      for (var header in headers) {
        req.setRequestHeader(headers[header]['name'], headers[header]['value']);
      }
      req.send();
    } 
  });
  
}

