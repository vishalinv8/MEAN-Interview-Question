const express = require("express");

const router = express.Router();

 

const FeedbackReporting = require("../controller/FeedbackReporting");

 

const propertyAction = require("../controller/propertyaction");

const listingsUpload = require("../controller/listingsUploadController");

const propertyType = require("../controller/propertytype");

const agreementController = require("../controller/AgreementController");

const chat = require("../controller/chat");

const cronController = require('../controller/CronController');

const propertyManagerController = require("../controller/PropertyManagerController");

const { validateParam, validateBody, schemas } = require("../helper/routeHelper");

const { transactionRuleCheck, managerActions, managerActionsPayment, checkEmployee, security2XCheck, categoryType, categoryTypeLease, categoryTypeLeaseParams, checkAadharKYC, proccessLeaseChangeRequestValidate } = require("../helper/middleware");

 

router.route("/getPropertyTypes")

    .get(propertyType.getAllCategories);

 

router.route("/getChatCats")

    .get(propertyType.getChatCats);

 

router.route("/getPropertiesAndTypesInOne/:role")

    .get(validateParam(schemas.idSchema, "role"), managerActions, propertyType.getPropertiesAndTypesInOne);

 

 

module.exports = router;

 

 

 