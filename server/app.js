const express = require("express");
const cors = require("cors");
const app = express();

// Packages import
const rateLimit = require("express-rate-limit");
const {
  expressLogger,
  expressErrorLogger,
} = require("./middlewares/logger.js");
const requestIp = require("request-ip");
const helmet = require("helmet");
const xss = require("xss-clean");
const fastwinston = require("fastwinston");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("express-compression");

// lib / Utils imports
const { createUserApiLog } = require("./middlewares/logs.js");
const { isJsonStr } = require("./lib/helper.js");
const ERROR_HANDLER = require("./lib/utils/utils.js");

// Routes import
const usersRoute = require("./routes/users.js");
const questionsRoute = require("./routes/questions.js");
const customerRoute = require("./routes/customer.js");
const phoneRoute = require("./routes/phone.js");
const config = require("./config/config.js");

// ---------------------------- Apply the rate limiting middleware to all requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

// ---------------------------- Middleware for accepting encoded & json request params
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// // ----------------------------Middleware for reading raw Body as text use req.body
app.use(
  express.text({
    type: "text/plain",
    limit: "50mb",
  }),
);

// ----------------------------Middleware for Getting a user's IP
app.use(requestIp.mw());

// ----------------------------Middleware to Fix CORS Errors This Will Update The Incoming Request before sending to routes
// Allow requests from all origins
app.use(cors());

// ----------------------------Middleware for printing logs on console
app.use(expressLogger);
// ----------------------------------Middleware Ended-------------------------------------

// ----------------------------Middleware to Fix CORS Errors This Will Update The Incoming Request before sending to routes
// Allow requests from all origins
app.use(cors());

// Configure Helmet
app.use(helmet());

// Add Helmet configurations
app.use(
  helmet.crossOriginResourcePolicy({
    policy: "cross-origin",
  }),
);

app.use(
  helmet.referrerPolicy({
    policy: "no-referrer",
  }),
);

// sanitize request data
// Configure xssClean middleware to whitelist all tags except <script> and allow "style" attribute
const xssOptions = {
  whiteList: {
    "*": ["style"], // Allow all tags with "style" attribute
    script: [], // Disallow <script> tags
  },
};

app.use(xss(xssOptions));

app.use(mongoSanitize());

// gzip compression
app.use(compression());

// -----------------------------Middleware for storing API logs into DB
app.use(function (req, res, next) {
  // Do whatever you want this will execute when response is finished
  res.once("end", function () {
    createUserApiLog(req, res);
  });

  // Save Response body
  const oldSend = res.send;
  res.send = function (data) {
    res.locals.resBody = isJsonStr(data) ? JSON.parse(data) : data;
    oldSend.apply(res, arguments);
  };
  next();
});

// ---------------------------- Route to Ping & check if Server is online
app.get(config.server.route + "/pingServer", (req, res) => {
  const message = `🚀 Server is Healthy. ${config.server.nodeEnv} environment is running. Database [${config.server.dbName}] using`;
  res.status(200).send(message);
});

app.use(`${config.server.route}/customers`, customerRoute);
app.use(`${config.server.route}/users`, usersRoute);
app.use(`${config.server.route}/questions`, questionsRoute);
app.use(`${config.server.route}/phone`, phoneRoute);

// ----------------------------Middleware for catching 404 and forward to error handler
app.use((req, res, next) => {
  const error = new Error(ERROR_HANDLER.HTTP_ERRORS.ERROR_404);
  error.statusCode = 404;
  next(error);
});

// Error handler
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const sendErrorResponse = (status, message, desc, stack) => {
    res.status(status).json({
      result: message,
      code: status,
      desc,
      stack: config.server.nodeEnv === "PROD" ? null : stack,
    });
  };

  // MongoDB errors
  if (error.name === "MongoError") {
    if (error.code === 11000) {
      sendErrorResponse(409, "Conflict", "Duplicate key", error.stack);
    } else {
      sendErrorResponse(
        500,
        "error",
        error.message || "Internal Server Error",
        error.stack,
      );
    }
  } else if (error.name === "MongoServerError") {
    if (error.code === 11000) {
      sendErrorResponse(409, "Conflict", "User already exists", error.stack);
    } else {
      sendErrorResponse(
        500,
        "error",
        error.message || "Internal Server Error",
        error.stack,
      );
    }
  }
  // ObjectID errors
  else if (error.name === "CastError" && error.kind === "[ObjectId]") {
    sendErrorResponse(400, "Bad Request", "Invalid ID", error.stack);
  } else if (error.name === "CastError" && error.kind === "ObjectId") {
    sendErrorResponse(400, "Bad Request", "Invalid ID", error.stack);
  }
  // Validation errors
  else if (error.name === "ValidationError") {
    const messages = Object.values(error.errors).map((e) => e.message);
    sendErrorResponse(422, "error", "Validation failed", error.stack, messages);
  }
  // Other errors
  else {
    const statusCode = error.statusCode || 500;
    sendErrorResponse(
      statusCode,
      "error",
      error.message || "Internal Server Error",
      error.stack,
    );
  }
});

// Best Tested place that store only uncaught errors
app.use(expressErrorLogger);

module.exports = app;
