const express = require('express');

const path = require('path');

const fs = require('fs');

const helmet = require('helmet');

const bodyParser = require('body-parser');

const lisings = require('./routes/listing');

const appointment = require('./routes/appointment');

const gpPool = require('./db/lib');

const app = express();

const chatHelper = require('./helper/chatHelper');

const swaggerUi = require('swagger-ui-express');

const swaggerDocument = require('./dist/api-docs.json');

const cors = require('cors');

 

if(process.env.NODE_ENV == 'local'){

  var corsOptions = {

    origin: 'http://localhost:4201',

    optionsSuccessStatus: 200 // For legacy browser support

  }

  app.use(cors(corsOptions));

}

 

/**Localization starts */

var i18n = require("i18n");

i18n.configure({

    locales:['en', 'fr', 'ms'],

    directory: __dirname + '/config/lang',

    objectNotation: true,

    register: global//,

    //defaultLocale: 'en',

    /*logDebugFn: function (msg) {

        console.log('debug', msg);

    },

    logWarnFn: function (msg) {

        console.log('warn', msg);

    },

    logErrorFn: function (msg) {

        console.log('error', msg);

    }*/

});

app.use(i18n.init);

/**Localization ends */

 

//const subpath = express();

const logDirectory = path.join(__dirname, 'log');

// ensure log directory exists

fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory)

// Couple the application to the Swagger module.

 

// view engine setup

app.set('views', path.join(__dirname, 'views'));

app.set('view engine', 'pug');

 

gpPool.poolStart();

app.use(helmet());

app.use(helmet.noCache());

app.use(helmet.frameguard());

app.use(helmet.xssFilter());

 

app.disable('x-powered-by');

 

app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: false }));

 

app.disable('etag');

app.use(function (req, res, next) {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  res.setHeader('Access-Control-Allow-Credentials', true);

  res.setHeader( 'Cache-Control', 'no-cache');

  next();

});

 

app.use('/', lisings);

app.use('/appointment', appointment);

app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

 

// catch 404 and forward to error handler

app.use(function(req, res, next) {

  var err = new Error('Not Found');

  err.status = 404;

  next(err);

});

 

// error handler

app.use(function(err, req, res, next) {

  // set locals, only providing error in development

  res.locals.message = err.message;

  res.locals.error = req.app.get('env') === 'development' ? err : {};

 

  // render the error page

  res.status(err.status || 500);

  res.render('error');

});

chatHelper.run();

module.exports = app;

 