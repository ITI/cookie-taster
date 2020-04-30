var express = require('express'), http = require('http'), cookieParser = require('cookie-parser'), morgan = require('morgan');
var app = express();

app.use(morgan('combined'));
app.use(function (req, res, next) {
    console.log(req.headers);
    next();
});

// need cookieParser middleware before we can do anything with cookies
app.use(cookieParser());

// set a cookie
app.use(function (req, res, next) {

  if (req.path != "/test.json") {
    next();
  } else  {

    // check if client sent cookie
    var cookie = req.cookies.cookieName;
    if (cookie === undefined) {
      // no: set a new cookie
      var randomNumber=Math.random().toString();
      randomNumber=randomNumber.substring(2,randomNumber.length);
      res.cookie('cookieName',randomNumber, { maxAge: 900000, httpOnly: true });
      res.json({'data': 'unauthenticated'});
    } else {
      res.json({'data': 'cookie authenticated'}); 
    }
  }
});

// let static middleware do its job
app.use(express.static(__dirname));


var server = http.createServer(app);
server.listen(3000);
