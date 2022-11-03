const httpHelper = require('../helper/httpHelper');
const config = require('../config/config').get(process.env.NODE_ENV);
const logger = require('../logger');
var validate = require('uuid-validate');
const PropertyType = require('../model/propertytype');
const find = require('arraysearch').Finder;
const cutomError = require("../helper/customerror");
const PropertyAction = require('../model/propertyaction');
const propertyManagerModel = require('../model/PropertyManagerModel');
const moment = require("moment");
const async = require('async');
const _ = require('underscore');
const utilityHelper = require('../helper/utility_helper');
const { __ } = require('i18n');
var selfPropType = {
    getAllCategories: async (req, res, next) => {//list notification categories
        logger.info("getAllCategories : ", req.value);
        var promise = PropertyType.getAllCategories();
        promise.then((data) => {
            data.forEach((element) => {
                if (element.images != undefined) {
                    if (element.images.trim() === "") {
                        element.images = "{}";
                    }
                    element.images = JSON.parse(element.images);
                }
            });
            return res.json({ "response": { "data": data } });
        }).catch((err) => {
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    getChatCats: async (req, res, next) => {
        logger.info("getChatCats : ", req.value);
        return PropertyType.getChatCats()
            .then((data) => {
                return res.json({ "response": { "data": data } });
            }).catch((err) => {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            });
    },
    getPropertiesAndTypesInOne: async (req, res, next) => {
        logger.info("getAllCategories : ", req.value);

        var resp = {};
        var promises = [];
        let header = { "userid": req.headers.userid, "Accept-Language": getLocale() };
        let allProp = config.APIs.Listing.resource.allProperties;
        allProp = allProp.replace(':role', req.value.params.role);
        promises.push(httpHelper.requestAPI(config.APIs.Listing.URL, allProp, "GET", '', header))
        promises.push(httpHelper.requestAPI(config.APIs.Listing.URL, config.APIs.Listing.resource.getPropertyTypes, "GET", '', header))

        Promise.all(promises).then((data) => {
            if (data.length == 0)
                throw new cutomError(__("noPropOrTypeFound"), 409);

            resp.allProperties = data[0].response.data;
            resp.propertyTypes = data[1].response.data;
            return res.json({ "response": { "data": resp } });
        }).catch((err) => {
            console.log('err inside getPropertiesAndTypesInOne', err)
            if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404))
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        });
    },

    hidePropFromListing: async (req, res, next) => {
        logger.info("hidePropFromListing : ", req.value);
        console.log("Inside hidePropFromListing");
        let userid = req.value.body.userid;
        let statusVal = req.value.body.status;
        async.waterfall([
            (callback) => {
                PropertyType.hidePropListing(userid, statusVal);
                callback(null, { responseCode: 200, response: { "details": [{ "message": __("listing_hidden_for_user") }] } });
            }
        ], (err, data) => {
            if (err) {
                logger.error(err);
            }
            res.status(data.responseCode).json(data.response);
        });
    },


    saveListingDocs: async (req, res, next) => {
        logger.info("saveListingDocuments : ", req.value);
        console.log("Inside saveListingDocuments");
        let listing_id = req.value.body.listing_id;
        let listing_doc_type = req.value.body.listing_doc_type;
        let listing_doc_files = req.value.body.listing_doc_files;
        let listing_files_string;
        async.waterfall([
            (callback) => {
                PropertyType.getPropertyInternal(listing_id)
                    .then(propertyDetails => {
                        if (!propertyDetails.length) {
                            callback({ error: __("noPropertyFound") }, { responseCode: 404, response: { "details": [{ "message": __("noPropertyFound") }] } });
                            return false;
                        }
                        callback(null, propertyDetails);
                    })
                    .catch(error => {
                        callback(error, { responseCode: 500, response: { "details": [{ "message": __("internalServer") }] } });
                    });
            },
            (propertyDetails, callback) => {
                propertyManagerModel.isPropertyAssigned(req.headers.userid, [listing_id], (error, results) => {
                    if (!error) {
                        if (results.length || (req.headers.userid != undefined && propertyDetails[0].userid == req.headers.userid)) {
                            callback(null, propertyDetails);
                        } else {
                            callback({ error: __("unauthProp") }, { responseCode: 409, response: { "details": [{ "message": __("unauthProp") }] } });
                        }
                    } else {
                        callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                    }
                });
            },
            (propertyDetails, callback) => {
                listing_files_string = listing_doc_files.join(',');
                let listing_doc_status = 1;
                PropertyType.updatePropertyDocuments(listing_id, listing_doc_status, listing_doc_type, listing_files_string);
                let previewPropLink = config.APIs.Web.URL + config.APIs.Web.resource.viewPropPage.replace(':id', propertyDetails[0].propertyid);
                let propDocumentMailData = {
                    template: "propDocumentUpload",
                    placeholder: {
                        propertyaddress: propertyDetails[0].address,
                        PROPVIEWLINK: previewPropLink
                    },
                    to: config.param.supportEmail,
                    subject: __("propertyDocumentUploaded"),
                };
                httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", propDocumentMailData).then(propDocEmailResp => {
                    console.log("Prop document uploaded....", propDocEmailResp);
                }).catch(propDocEmailErrResp => {
                    console.log("propDocEmailErrResp", propDocEmailErrResp);
                });
                callback(null, { responseCode: 200, response: { "details": [{ "message": __("property_documents_saved") }] } });
            }
        ], (err, data) => {
            if (err) {
                logger.error(err);
            }
            res.status(data.responseCode).json(data.response);
        });
    },


    getPropertyDocs: async (req, res) => {
        logger.info("getPropertyDocuments : ", req.value);
        var promise = PropertyType.getPropertyInternal(req.value.params.id);
        promise.then((result) => {
            if (result.length == 0)
                return res.status(404).json({ "details": [{ "message": __("listingNotFound") }] });
            else {
                if (result[0].userid != req.headers.userid) {
                    return res.status(409).json({ "details": [{ "message": __("unauthProp") }] });
                }
                else {
                    if (result[0].listingDocs != null && result[0].listingDocs != '') {
                        result[0].listingDocs = result[0].listingDocs.split(',').map(obj => {
                            return {
                                fileName: obj.trim(),
                                url: config.param.CDN_URL + config.param.property_doc_s3 + obj.trim()
                            };
                        });
                    }
                    else {
                        result[0].listingDocs = [];
                    }
                }
                return result;
            }
        }).then((result) => {
            result[0].listingDocTypeItems = [];
            httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.dropdownoptions.replace(':slug', 'property-documents'), "GET", '')
                .then(response => {
                    if (typeof response.response.data != 'undefined' && response.response.data.length > 0) {
                        result[0].listingDocTypeItems = response.response.data[0].items;
                    }
                    return res.json({ "response": { "data": result } });
                }).catch(error => {
                    logger.error(error);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                });
        }).catch((err) => {
            console.log(err)
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },

    saveListing: async (req, res, next) => {
        logger.info("saveListing : ", req.value);
        console.log("Inside saveListing");
        let transactionRules = [];
        let userData = {};
        let violation = null;
        let transactionDetails = {};
        let violationMessages = [];
        let propertyId = 0;
        async.waterfall([
            (callback) => {
                let userinfoResourse = config.APIs.user.resource.userinfo.replace(":userId", req.headers.userid);
                httpHelper.requestAPI(config.APIs.user.URL, userinfoResourse, "GET", '').then(response => {
                    if (response.response.data.length) {
                        userData = response.response.data[0];
                        if (parseInt(userData.isemployee) === 1) {
                            req.headers.userid = userData.managerid;
                            req.value.body.usrid = userData.managerid;
                        }
						 if (parseInt(userData.ismanager) === 2) {
							req.value.body.isbroker = 1;
                        }
                        callback(null);
                    } else {
                        callback('User not found', { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                    }
                }).catch(error => {
                    callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                });
            },
            (callback) => {
                httpHelper.requestAPI(config.APIs.Payment.URL, config.APIs.Payment.resource.getTransactionReport.replace(':userid', req.headers.userid), "GET", '').then(response => {
                    if (response.data.length) {
                        if (!response.data[0].totalMonthlyAmt) {
                            response.data[0].totalMonthlyAmt = 0;
                        }
                        transactionDetails = response.data[0];
                        callback(null);
                    } else {
                        callback('Transaction Deatils Error', { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                    }
                }).catch(error => {
                    callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                });
            },
            (callback) => {
                if (parseInt(req.value.body.pageid) === 1) {
                    PropertyType.getParentCategory(req.value.body.listcatconfigid).then(response => {
                        req.value.body.parentCatid = response.parentid;
                        callback(null);
                    }).catch(error => {
                        callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                    });
                } else {
                    callback(null);
                }
            },
            (callback) => {
                if (parseInt(req.value.body.pageid) === 1) {
                    userRole = userData.ismanager == 1 ? "-1" : "2";
                    httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.transactionRules.replace(':country', config.param.countryCode).replace(':categoryid', req.value.body.parentCatid), "GET", '').then(response => {
                        transactionRules = _.filter(response.response.data, function (obj) {
                            return parseInt(obj.role) == userRole;
                        });
                        transactionRules[0].max_properties = req.value.body.max_properties;
                        callback(null);
                    }).catch(error => {
                        callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                    });
                } else {
                    callback(null);
                }
            },
            (callback) => {
                /*
                 * Property List count rules check 
                 */
                if (!transactionRules.length) {
                    callback(null);
                    return false;
                }
                PropertyType.countLandlordProperties(req.headers.userid).then(response => {
                    if (response.landlord_properties > transactionRules[0].max_properties) {
                        violation = 1;
                        if (parseInt(req.value.body.pageid) === 1) {
                            let supportMailData = {
                                template: "landlordPropertiesSupport",
                                placeholder: {
                                    userData: userData
                                },
                                to: config.param.supportEmail,
                                subject: __("propertyLimitViolation")
                            };
                            httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", supportMailData).then(email => {
                                console.log(email);
                            }).catch(emailError => {
                                console.log(emailError);
                            });
                            violationMessages.push(101);
                        }
                    }
                    callback(null);
                }).catch(error => {
                    callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                });
            },
            (callback) => {
                /*
                 * Rent amount rules check
                 */
                if (!transactionRules.length) {
                    callback(null);
                    return false;
                }

                let newMonthlyAmount = 0
                if (req.value.body.rentamt != undefined && req.value.body.paymentfreq != undefined) {
                    let amountMonthly = utilityHelper.calculateMonthlyAmount(req.value.body.rentamt, req.value.body.paymentfreq);
                    newMonthlyAmount = parseFloat(transactionDetails.totalMonthlyAmt) + parseFloat(amountMonthly);
                }


                if (parseFloat(req.value.body.rentamt) < parseFloat(transactionRules[0].min_transaction_amount) && (parseInt(req.value.body.pageid) === 2)) {
                    callback('Minimum Amount', { responseCode: 400, response: { details: [{ message: __("validation.valid.minimumRent").replace('{amount}', transactionRules[0].min_transaction_amount) }] } });
                    return false;
                } else if (parseFloat(req.value.body.rentamt) > parseFloat(transactionRules[0].max_transaction_amount)) {
                    violation = 1;
                    if (parseInt(req.value.body.pageid) === 2) {
                        let supportMailData = {
                            template: "landlordMaxAmountSupport",
                            placeholder: {
                                userData: userData
                            },
                            to: config.param.supportEmail,
                            subject: __("propertyLimitViolation")
                        };
                        httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", supportMailData).then(email => {
                            console.log(email);
                        }).catch(emailError => {
                            console.log(emailError);
                        });
                        violationMessages.push(105);
                    }
                } else if (newMonthlyAmount > parseFloat(transactionRules[0].max_monthly_amount)) {
                    violation = 1;
                    if (parseInt(req.value.body.pageid) === 2) {
                        let supportMailData = {
                            template: "landlordMaxMonthlyAmountSupport",
                            placeholder: {
                                userData: userData
                            },
                            to: config.param.supportEmail,
                            subject: __("propertyLimitViolation")
                        };
                        httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", supportMailData).then(email => {
                            console.log(email);
                        }).catch(emailError => {
                            console.log(emailError);
                        });
                        violationMessages.push(107);
                    }
                }
                callback(null);
            },
            (callback) => {
                if (req.value.body.pageid == 1) {//&& (req.value.body.glatt == '' || req.value.body.glatt == 0 || req.value.body.glong == 0 || req.value.body.glong == '')

                    findLatLong = config.APIs.google.resource.findLatLong.replace(':address', req.value.body.addr);
                    httpHelper.requestAPI(config.APIs.google.URL, findLatLong, "GET", '').then(results => {
                        req.value.body.glatt = results.results[0].geometry.location.lat;
                        req.value.body.glong = results.results[0].geometry.location.lng;
                        callback(null);
                    }).catch(error => {
                        console.log(error);
                        logger.error(error, "Error in lat long fetch");
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            },
            (callback) => {
                var propertyPage = config.APIs.Web.URL + config.APIs.Web.resource.viewPropPage;
                propertyPage = propertyPage.replace(':id', req.value.body.listing_cfgid);
                var userinfo1 = "";

                var promise = httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.clientconfiguration.replace(':country', config.param.countryCode), "GET", '');
                promise.then((clientData) => {
                    req.value.body.adminpublishstatus = 'A';
                    if (typeof clientData.response !== 'undefined' && clientData.response.data.length && typeof clientData.response.data[0].countrySettings !== 'undefined' && typeof clientData.response.data[0].countrySettings[0].property_publish_status !== 'undefined' && clientData.response.data[0].countrySettings[0].property_publish_status !== 'A') {
                        req.value.body.adminpublishstatus = 'P';
                    }
                    if (violation) {
                        //req.value.body.adminpublishstatus = 'P';
						req.value.body.adminpublishstatus = 'V'; // temporarily make admin status to V so that user can make payment for the moment.
                    }
                    req.value.body.phots = (req.value.body.phots != undefined) ? req.value.body.phots.toString() : '';
                    return PropertyType.SaveListing(req.value.body);
                }).then((data) => {
                    if (Array.isArray(data) && data[0][0] != undefined && data[0][0].validationError == "listingAddressError") {
                        throw new cutomError(__("addressExist"), 400);
                    } else if (Array.isArray(data) && data[0][0] != undefined && data[0][0].validationError == "listingTitleError") {
                        throw new cutomError(__("titleExist"), 400);
                    } else if (Array.isArray(data) && data[0][0] != undefined && data[0][0].validationError == "noUserListing") {
                        throw new cutomError(__("listingNotFound"), 404);
                    } else {
                        if (violationMessages.length) {
                            propertyId = data[1][0].listing_cfgid;
                            _.each(violationMessages, code => {
                                PropertyType.addPropertyVoilations(propertyId, code, (error, results) => {
                                    if (error) {
                                        console.log("addPropertyVoilations: ", error);
                                    }
                                });
                            });
                        }
                        return PropertyType.getPropertyStatus(data[1][0]);
                    }
                }).then((propertyData) => {

                    if (typeof req.value.body.is_feature_property !== 'undefined' && req.value.body.is_feature_property === 1 && propertyData[0].publishstatus === 'P') {
                        let previewPropLink = config.APIs.Web.URL + config.APIs.Web.resource.viewPropPage.replace(':id', propertyData[0].id);
                        let featuredPropMailData = {
                            template: "featuredProperty",
                            placeholder: {
                                propertyaddress: propertyData[0].address,
                                PROPVIEWLINK: previewPropLink
                            },
                            to: config.param.marketingSupportEmail,
                            subject: __("featuredPropertyPublished"),
                        };
                        httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", featuredPropMailData).then(featurePropMailRes => {
                            console.log("featurePropMailRes", featurePropMailRes);
                        }).catch(featurePropMailErr => {
                            console.log("featurePropMailErr", featurePropMailErr);
                        });
                    }


                    if (propertyData[0].publishstatus != 'D' && req.value.body.pageid == 5) {

                        userinfo = config.APIs.user.resource.userinfo.replace(":userId", propertyData[0].userid);
                        var promiseEmail = httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '');
                        promiseEmail.then((userinfo) => {
                            userinfo1 = userinfo.response.data[0];
                            var data = { "template": "editListing", "placeholder": { "fullname": userinfo1.fullname, "propLink": propertyPage, "propAddress": propertyData[0].address }, "to": userinfo1.email, "subject": __("notificationListingModifiedTitle"), "userId": userinfo1.id }
                            return httpHelper.requestAPI(config.APIs.notification.URL, config.APIs.notification.resource.sendmail, "POST", data, { "Accept-Language": getLocale() });
                        }).then(() => {
                            let listingData = { "listing_cfgid": req.value.body.listing_cfgid, "propertyid": req.value.body.listing_cfgid };
                            notificationData = { "title": propertyData[0].address, "description": __("notificationListingModifiedDesc"), "data": listingData, "type": "editListing" };
                            addNotification = config.APIs.notification.resource.addNotification.replace(":userId", userinfo1.id);
                            httpHelper.requestAPI(config.APIs.notification.URL, addNotification, "POST", notificationData, { "Accept-Language": getLocale() });
                            callback(null, { responseCode: 200, response: { "details": [{ "message": __("listingUpdated") }], "response": { "data": { "listing_cfgid": propertyData[0].id, "percentage": propertyData[0].percentage_completed } } } });
                        }).catch((err) => {
                            console.log("err123", JSON.stringify(err));

                            /* Showing success to user Even If notification in disabled */
                            if (typeof err.message.details[0].message != 'undefined' && err.message.details[0].message == 'Email is disabled by the user.') {
                                callback(null, { responseCode: 200, response: { "details": [{ "message": __("listingUpdated") }], "response": { "data": { "listing_cfgid": propertyData[0].id, "percentage": propertyData[0].percentage_completed } } } });
                            }

                            if (typeof err.details === "undefined") {
                                callback(err, { responseCode: 500, response: { "details": [{ "message": err.message }] } });
                            } else {
                                callback(err, { responseCode: 400, response: { "details": [{ "message": err.details[0].message }] } });
                            }
                        });
                    } else {
                        callback(null, { responseCode: 200, response: { "details": [{ "message": __("listingSaved") }], "response": { "data": { "listing_cfgid": propertyData[0].id, "percentage": propertyData[0].percentage_completed } } } });
                    }
                }
                ).catch((err) => {
                    if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404)) {

                        callback(err, { responseCode: err.type, response: { "details": [{ "message": err.message }] } });
                    } else {
                        callback(err, { responseCode: 500, response: { "details": [{ "message": __("internalServer") }] } });
                    }
                });
            }
        ], (err, data) => {
            if (err) {
                console.log(err.message);
                logger.error(err);
            }
            res.status(data.responseCode).json(data.response);
        });
    },
    saveAboutPlace: async (req, res, next) => {
        logger.info("saveAboutPlace : ", req.body);
        if (req.body.listing_catconfigid == undefined) {
            return res.status(400).json({ "details": [{ "message": __("validation.require.category") }] });
        } else if (req.body.usrid == undefined) {
            return res.status(400).json({ "details": [{ "message": __("validation.require.userid") }] });
        } else if (req.body.pageid == 3) {
            req.body.usrid = req.headers.userid;
            var parentid = '';
            var promise = PropertyType.getParentCategory(req.body.listing_catconfigid);
            promise.then((catData) => {
                parentid = catData.parentid;
                return PropertyType.getAboutPlaceOptions(catData.parentid);
            }).then((data) => {
                var errcnt = 0;
                len = parseInt(data.length);
                for (var i = 0; i < data.length; i++) {
                    elem = data[i];
                    if (elem.fieldname != null) {
                        obj = find.one.in(req.body.items).with({ "aboutplace_configid": "" + elem.Id });
                        var regex = new RegExp(elem.customExpression, 'g');
                        var validmsg = JSON.parse(elem.validationmsg);
                        if (elem.isRequired == 1 && obj == undefined) {
                            errcnt++;
                            throw new cutomError(validmsg.required, 400);
                            break;
                        } else if (elem.customExpression != null && obj != undefined && obj.text != '' && (regex.test(obj.text) == false)) {
                            errcnt++;
                            throw new cutomError(validmsg.regexp, 400);
                            break;
                        } else if (obj != undefined && obj.text != '' && elem.maxLength != null && obj.text.length > elem.maxLength) {
                            errcnt++;
                            throw new cutomError(validmsg.maxlength, 400);
                            break;
                        }
                        var textvalue = "";
                        if (obj != undefined) {
                            textvalue = obj.text;
                            if (elem.fieldtype == 'C' && _.isArray(obj.text)) {
                                textvalue = obj.text.join(",");
                            }
                        }
                        req.body[elem.fieldname + "_text"] = textvalue;
                        req.body[elem.fieldname + "_cfgid"] = elem.Id;
                    }
                };
                req.body.listcatconfigid = parentid;
                return PropertyType.SaveListing(req.body);

            }).then((result) => {

                if (Array.isArray(result) && result[0][0] != undefined && result[0][0].validationError == "noUserListing") {
                    return res.status(404).json({
                        "details": [{ "message": __("listingNotFound") }],
                        "response": { "data": { "listing_cfgid": req.body.listing_cfgid } }
                    });
                } else {
                    return PropertyType.getPropertyStatus({ "listing_cfgid": req.body.listing_cfgid });
                    /*return res.json({"details": [{"message": __("listingSaved}],
                        "response": {"data": {"listing_cfgid": req.body.listing_cfgid}}});*/
                }
            }).then((propertyData) => {
                return res.json({
                    "details": [{ "message": __("listingSaved") }],
                    "response": { "data": { "listing_cfgid": req.body.listing_cfgid, "percentage": propertyData[0].percentage_completed } }
                });
            }).catch((err) => {
                if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404))
                    return res.status(err.type).json({ "details": [{ "message": err.message }] });
                else {
                    logger.error(err);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            });
        } else {
            return res.status(400).json({ "details": [{ "message": __("validation.valid.pageid3") }] });
        }
    },
    saveAmenities: async (req, res, next) => {
        logger.info("saveAmenities : ", req.value.body);
        req.value.body.usrid = req.headers.userid;
        var textvalue = '';
        for (var i = 0, len = req.value.body.items.length; i < len; i++) {
            var textvalue = (textvalue != '') ? textvalue + "," + req.value.body.items[i].amenities_configid : req.value.body.items[i].amenities_configid;
        };
        req.value.body["amenities_cfgid"] = textvalue;
        var promise = PropertyType.SaveListing(req.value.body);
        promise.then((data) => {
            if (Array.isArray(data) && data[0][0] != undefined && data[0][0].validationError == "noUserListing") {
                return res.status(404).json({
                    "details": [{ "message": __("listingNotFound") }],
                    "response": { "data": { "listing_cfgid": req.body.listing_cfgid } }
                });
            } else {
                return PropertyType.getPropertyStatus({ "listing_cfgid": req.body.listing_cfgid });
                /*return res.json({"details": [{"message": __("listingSaved}],
                    "response": {"data": {"listing_cfgid": req.body.listing_cfgid}}});*/
            }
        }).then((propertyData) => {
            return res.json({
                "details": [{ "message": __("listingSaved") }],
                "response": { "data": { "listing_cfgid": req.body.listing_cfgid, "percentage": propertyData[0].percentage_completed } }
            });
        }).catch((err) => {
            if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404))
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        });
    },
    previewListing: async (req, res) => {
        console.log("Inside previewListing");
        if (typeof req.headers.userid === 'undefined') {
            req.headers.userid = 0;
        }

        var headersLang = { "Accept-Language": getLocale() };
        var commonApplyData = {};
        var propertyPreview = {};
        var manyPromises = [];
		var packagesList = [];
		var listingAvailableCount = 0;
        var zonesInfo = {};

        let feedback_years = 0;
        httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.clientconfiguration.replace(':country', config.param.countryCode), "GET", '', headersLang).then(clientData => {
            if (clientData.response.data.length && typeof clientData.response.data[0].countrySettings !== 'undefined' && clientData.response.data[0].countrySettings.length && typeof clientData.response.data[0].countrySettings[0].feedback_years !== 'undefined') {
                feedback_years = clientData.response.data[0].countrySettings[0].feedback_years;
            }
			
			/* Check how many credit avaialble from bulk packages */
			propertyManagerModel.bulkPurchasedPackages(req.headers.userid, (error, packageResults) => {
                if (!error) {
                    packagesList = packageResults[0];
					if(typeof packagesList != 'undefined' && packagesList.length > 0){
						_.each(packagesList, packageRow => {
							if(packageRow.packageStatus == 'available'){
								listingAvailableCount += parseInt(packageRow.available);
							}
						});
					}
                }
            });
			return PropertyType.previewListing(req.value.params.id);
			
        }).then((result) => {
						
            if (result.length == 0) {
                throw new cutomError(__("listingNotFound"), 404);
            }

            if (result[0].adminpublishstatus != 'A' && req.headers.userid != result[0].userid) {
                throw new cutomError(__("listingNotFound"), 404);
            }
			
			result[0].packageLeftForPM = listingAvailableCount;

            if (result[0].description != '' && result[0].description != null) {
                result[0].description = result[0].description.replace(config.param.removeMobileNoRegex, " ***** ");
            }
            if (result[0].photos != null && result[0].photos != '') {
                var photos = result[0].photos.split(",");
                result[0].photos = photos.map((x) => {
                    return httpHelper.photoObject(x, 'large');
                });
            } else {
                result[0].photos = config.param.defaulPropertytImageObject
            }
            aboutObj = {}
            aboutMobile = {}
            aboutMobile.field = [];
            aboutMobile.aboutObj = [];
            aboutMobile.field.push({ "fieldname": "availability", "aboutplace_lable": "Date available" });

            if (result[0].about != null) {
                result[0].about = JSON.parse(result[0].about);
                result[0].about.forEach((obj) => {

                    obj.aboutplace_lable = obj.aboutplace_lable.replace("(Optional)", "");

                    if (aboutObj[obj.fieldname] == undefined)
                        aboutObj[obj.fieldname] = [];

                    ///logic for mobile json
                    var even = _.countBy(result[0].about, (num) => {
                        if (num.fieldname == obj.fieldname) {
                            return 'matched'
                        } else {
                            return "unmatched"
                        }
                    });

                    if (even.matched == 1) {
                        aboutMobile.field.push({ "fieldname": obj.fieldname, "aboutplace_lable": obj.aboutplace_lable + ":" + obj.text });
                    } else {
                        aboutMobile.field.push({ "fieldname": obj.fieldname, "aboutplace_lable": obj.aboutplace_lable });
                        aboutMobile.aboutObj.push({ "fieldname": obj.fieldname, "value": obj.text });
                    }
                    // logic for mobile json ends here
                    aboutObj[obj.fieldname].push(obj);
                })
                result[0].about = aboutObj;

                aboutMobile.field = [...new Set(aboutMobile.field.map(o => JSON.stringify(o)))].map(s => JSON.parse(s))

                result[0].aboutMobile = aboutMobile;
            }
            aboutMobile.field.push({ "fieldname": "otherInfo", "aboutplace_lable": "Other Information" });
            aboutMobile.field.push({ "fieldname": "applicationRequiremnt", "aboutplace_lable": "Application Requirements" });
            aboutMobile.field.push({ "fieldname": "amenities", "aboutplace_lable": "Amenities" });
            if (result[0].amenities != null) {
                result[0].amenities = JSON.parse(result[0].amenities);
            }
            if (result[0].securitydeposit == null) {
                result[0].securitydeposit = 0;
            }
            if (result[0].propertyid == null) {
                result[0].propertyid = "";
            }
            if (result[0].listcatparentid != 1) {
                delete result[0].moveingcost;
            } else if (result[0].moveingcost == null) {
                result[0].moveingcost = 0;
            }
            propertyPreview.propertyData = result;
            return PropertyAction.getRenterSharedInfo(req.headers.userid, req.value.params.id);
        }).then((application) => {
            commonApplyData.application = application;
            propertyPreview.propertyData[0].application = (application.length > 0) ? application[0].applicationstatus : "notApplied";
            return PropertyAction.propertyLiked(req.headers.userid, req.value.params.id);
        }).then((likedproperty) => {
            propertyPreview.propertyData[0].liked = (likedproperty.length > 0) ? 1 : 0;
            userinfo = config.APIs.user.resource.userinfoInternal.replace(":userId", propertyPreview.propertyData[0].userid);
            return httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang);
        }).then((landLordInfo) => {
            propertyPreview.landLordInfo = landLordInfo.response.data;
            return PropertyAction.getratingLandlord(propertyPreview.propertyData[0].userid, "AVG", feedback_years)
        }).then((landlordRating) => {

            propertyPreview.landlordRating = landlordRating;
            return PropertyAction.getratingProperty(req.value.params.id, "AVG", feedback_years);
        }).then((propertyRating) => {

            propertyPreview.propertyRating = propertyRating;

            //let h1 = config.APIs.user.resource.timeZone.replace(":id", req.headers.userid);
            if (req.headers.userid) {
                return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.timeZone.replace(":id", req.headers.userid), "GET", '', headersLang);
            }
            return { error: 1 };
        }).then((timezone) => {

            zonesInfo.viewerZonename = '';
            if (!timezone.error) {
                zonesInfo.viewerZonename = timezone.data.zonename;
                propertyPreview.propertyData[0].publishedon = httpHelper.zoneConvert(propertyPreview.propertyData[0].publishedon, timezone.data.zonename);
            }

            /**Get landlord's zonename */
            return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.timeZone.replace(":id", propertyPreview.propertyData[0].userid), "GET", '', headersLang);
        }).then((timezoneLandlord) => {

            if (!timezoneLandlord.error) {
                zonesInfo.publisherZonename = timezoneLandlord.data.zonename;
            }

            return httpHelper.requestAPI(config.APIs.Listing.URL, config.APIs.Listing.resource.appointmentAvailability.replace(':propertyId', req.value.params.id), "GET", '', { userid: propertyPreview.propertyData[0].userid, "Accept-Language": getLocale() });
        }).then(appointmentdata => {
            propertyPreview.sharedProfileMobile = [];
            propertyPreview.checkBeforeApply = {};
            propertyPreview.appointmentData = {
                status: 0,
                availability: []
            };

            if (typeof appointmentdata.response !== 'undefined' && typeof appointmentdata.response.data !== 'undefined' && appointmentdata.response.data.length) {
                delete appointmentdata.response.data[0].property_id;
                if (parseInt(appointmentdata.response.data[0].payment_status) === 2) {
                    appointmentdata.response.data[0].status = 0;
                }
                if (zonesInfo.publisherZonename && zonesInfo.viewerZonename && zonesInfo.publisherZonename != zonesInfo.viewerZonename) {
                    var todayUTC = moment().utc().format('YYYY-MM-DD');
                    appointmentdata.response.data[0].availability = _.map(appointmentdata.response.data[0].availability, function (obj) {
                        obj.start_time = httpHelper.zoneConvertTimeFromTo(todayUTC + " " + obj.start_time, zonesInfo.publisherZonename, zonesInfo.viewerZonename);
                        obj.end_time = httpHelper.zoneConvertTimeFromTo(todayUTC + " " + obj.end_time, zonesInfo.publisherZonename, zonesInfo.viewerZonename);
                        return obj;
                    });
                }

                //var starttimePerAus = httpHelper . zoneConvertTimeFromTo(todayUTC +" "+ appointmentdata.response.data[0].availability[0].start_time, zonesInfo . publisherZonename, zonesInfo . viewerZonename);
                //console.log("starttimePerAus", starttimePerAus)
                /*console.log("ViewerZone Info:", zonesInfo . viewerZonename);
                console.log("landlordID:", propertyPreview.propertyData[0].userid);
                console.log("publisher zonename Info: ", zonesInfo . publisherZonename);*/
                //zonesInfo . viewerZonename
                //propertyPreview.propertyData[0].userid

                /*appointmentdata.response.data[0].availability = _.map(appointmentdata.response.data[0].availability,function(obj){
                    obj.start_time = moment("2019-10-10 "+obj.start_time).format("hh:mm A");
                    obj.end_time = moment("2019-10-10 "+obj.end_time).format("hh:mm A");
                    return obj;
                });*/

                propertyPreview.appointmentData = appointmentdata.response.data[0];
            }
            if (req.headers.userid) {
                /*Get renterprofile info for this logged in user */
                manyPromises.push(httpHelper.requestAPI(config.APIs.renterprofile.URL, config.APIs.renterprofile.resource.isInfoFilled.replace(':userId', req.headers.userid), "GET", '', headersLang));

                /*Check if user has uploaded profile pic or not */
                manyPromises.push(httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.isProfilePicUploaded.replace(':userId', req.headers.userid), "GET", '', { userid: req.headers.userid, "Accept-Language": getLocale() }));

                /**User can share credit report, even if not already filled. in case of no credit report, landlord can get it done. */
                /*Check if user has credit check done, to be shared in apply property*/
                /*manyPromises.push(httpHelper.requestAPI(config.APIs.CreditCheck.URL, config.APIs.CreditCheck.resource.isReportToShare.replace(':userId', req.headers.userid), "GET", '', {userid: req.headers.userid, "Accept-Language": getLocale()}));*/

                /** Get days for which there is an accepted / pending so that landlord cannot change it */
                manyPromises.push(httpHelper.requestAPI(config.APIs.Listing.URL, config.APIs.Listing.resource.getAppointmentDaysToDisable.replace(':property_id', req.value.params.id), "GET", '', { userid: req.headers.userid, "Accept-Language": getLocale() }));

                Promise.all(manyPromises).then((promisesResp) => {

                    if (promisesResp[0].response.data.length != 0)
                        propertyPreview.checkBeforeApply = Object.assign(propertyPreview.checkBeforeApply, promisesResp[0].response.data[0]);

                    if (promisesResp[1].response.data.isUploaded != undefined)
                        propertyPreview.checkBeforeApply.isUploaded = promisesResp[1].response.data.isUploaded;

                    if (promisesResp[2].response.data.length > 0)
                        propertyPreview.appointmentData.appointmentDays = promisesResp[2].response.data;

                    /*if (promisesResp[2].response.data.length != 0)
                        propertyPreview.checkBeforeApply = Object.assign(propertyPreview.checkBeforeApply, promisesResp[2].response.data[0]);*/

                    /*Code for mobile api, per discussion with Gurvinder Singh, by Monika */

                    var existingVlas = [];
                    existingVlas['profilepic'] = 0;
                    existingVlas['rentalhistory'] = 0;
                    existingVlas['screening'] = 0;
                    existingVlas['employment'] = 0;
                    existingVlas['reference'] = 0;
                    //existingVlas['creditcheck'] = 1;

                    if (commonApplyData.application.length > 0) {
                        let existvalues = JSON.parse(commonApplyData.application[0].sharedprofilesection);

                        existingVlas['profilepic'] = existvalues.profilepic == true ? 1 : 0;
                        existingVlas['rentalhistory'] = existvalues.rentalhistory == true ? 1 : 0;
                        existingVlas['screening'] = existvalues.screening == true ? 1 : 0;
                        existingVlas['employment'] = existvalues.employment == true ? 1 : 0;
                        existingVlas['reference'] = existvalues.reference == true ? 1 : 0;
                        //existingVlas['creditcheck'] = existvalues.creditcheck == true ? 1 : 0;
                    }

                    obj = {};
                    obj.value = existingVlas['profilepic'];
                    obj.lable = __("profilepic");
                    obj.slug = "profilepic";
                    obj.canCheck = 0;
                    if (propertyPreview.checkBeforeApply.isUploaded != undefined && propertyPreview.checkBeforeApply.isUploaded == 1)
                        obj.canCheck = 1;

                    propertyPreview.sharedProfileMobile.push(obj);

                    obj = {};
                    obj.value = 1;
                    obj.lable = __("profileDetails");
                    obj.slug = "personaldetail";
                    obj.canCheck = 1;
                    propertyPreview.sharedProfileMobile.push(obj);

                    obj = {};
                    obj.value = existingVlas['rentalhistory'];
                    obj.lable = __("Occupancy");
                    obj.slug = "rentalhistory";
                    obj.canCheck = 0;
                    if (propertyPreview.checkBeforeApply.occupancy != undefined && propertyPreview.checkBeforeApply.occupancy == 1)
                        obj.canCheck = 1;

                    propertyPreview.sharedProfileMobile.push(obj);

                    obj = {};
                    obj.value = existingVlas['employment'];
                    obj.lable = __("employmentHistory");
                    obj.slug = "employment";
                    obj.canCheck = 0;
                    if (propertyPreview.checkBeforeApply.employment != undefined && propertyPreview.checkBeforeApply.employment == 1)
                        obj.canCheck = 1;

                    propertyPreview.sharedProfileMobile.push(obj);

                    obj = {};
                    obj.value = existingVlas['screening'];
                    obj.lable = __("screenQuestion");
                    obj.slug = "screening";
                    obj.canCheck = 0;
                    if (propertyPreview.checkBeforeApply.screening != undefined && propertyPreview.checkBeforeApply.screening == 1)
                        obj.canCheck = 1;

                    propertyPreview.sharedProfileMobile.push(obj);

                    obj = {};
                    obj.value = existingVlas['reference'];
                    obj.lable = __("References");
                    obj.slug = "reference";
                    obj.canCheck = 0;
                    if (propertyPreview.checkBeforeApply.reference != undefined && propertyPreview.checkBeforeApply.reference == 1)
                        obj.canCheck = 1;

                    propertyPreview.sharedProfileMobile.push(obj);
                    //
                    //                    obj = {};
                    //                    obj.value = 1;
                    //                    obj.lable = __("creditCheck");
                    //                    obj.slug = "creditcheck";
                    //                    obj.canCheck = 1;

                    //                    propertyPreview.sharedProfileMobile.push(obj);
                    propertyPreview = selfPropType.__addressDataHide(propertyPreview);
                    return res.json({ "response": { "data": propertyPreview } });
                }).catch((err2) => {
                    console.log(err2);
                    logger.error(err2);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                });
            } else {
                propertyPreview = selfPropType.__maskPropertyData(propertyPreview);
                return res.json({ "response": { "data": propertyPreview } });
            }

        }).catch((err) => {
            console.log("err", err);
            if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404))
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            else if (err.statusCode != undefined) {
                var errMsg = __("internalServer");
                if (typeof err.message.details !== 'undefined') {
                    errMsg = err.message.details[0].message;
                }
                return res.status(err.statusCode).json({ "details": [{ "message": errMsg }] });
            } else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        });
    },
    __addressDataHide: (propertyPreview) => {
        if (!parseInt(propertyPreview.propertyData[0].isshow_full_address)) {
            let addressArr = [propertyPreview.propertyData[0].city_town, propertyPreview.propertyData[0].state_province_region, propertyPreview.propertyData[0].zip_postcode];
            propertyPreview.propertyData[0].address = addressArr.join(', ');
        }
        if (propertyPreview.propertyData[0].description === null) {
            propertyPreview.propertyData[0].description = '';
        }
        return propertyPreview;
    },
    __maskPropertyData: (propertyPreview) => {
        propertyPreview.propertyData[0].address = 'XXXX XXXXXX XXXXXXXXXXX';
        propertyPreview.propertyData[0].suite_unit_bldg_flr = 'XXXXXX';
        propertyPreview.propertyData[0].streetno = 'XXXX';
        // propertyPreview.propertyData[0].city_town = 'XXXX XXXX';
        // propertyPreview.propertyData[0].state_province_region = 'XXXXXXXX';
        propertyPreview.propertyData[0].zip_postcode = 'XXXXXX';
        propertyPreview.propertyData[0].streetname = 'XXXXXXXXXX';
        if (propertyPreview.landLordInfo.length) {
            propertyPreview.landLordInfo[0].fullname = 'XXXXXX XXXXXXX';
            propertyPreview.landLordInfo[0].email = 'XXXXXXXX@XXXX.XX';
            propertyPreview.landLordInfo[0].mobile = '+XX-XXXXXXXXXX';
            propertyPreview.landLordInfo[0].birthdate = 'XXXX-XX-XX';
           // propertyPreview.landLordInfo[0].profileimage = config.param.defaulProfileImage;
        }
        return propertyPreview;
    },
    getPropertyList: async (req, res, next) => {
        logger.info("getPropertyList : ", req.value);

        if (req.value.body.statusType == 'A') {
            req.value.body.statusType = 'A,E,V';
        }

        if (req.value.body.statusType == 'DA') {
            req.value.body.statusType = 'D,A,E,V';
        }

        var promise = PropertyType.getPropertyList(req.value.body);
        promise.then((result) => {
            result.forEach((element) => {
                element.list_status = element.publishstatus;
                if (element.publishstatus == 'E')
                    element.publishstatus = 'A'
                if (element.publishstatus == 'V')
                    element.publishstatus = 'A'
                if (element.photos != null && element.photos != '') {
                    let photos = element.photos.split(",");
                    element.photos = photos.map((x) => {
                        return httpHelper.photoObject(x, 'medium')
                    });
                } else {
                    element.photos = config.param.defaulPropertytImageObject
                }
                element.created = httpHelper.zoneConvertFromTo(element.created, 'UTC', config.param.timezone);
            });
            return res.json({ "response": { "data": result } });
        }).catch((err) => {
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    getAboutPlaceOptions: async (req, res, next) => {
        logger.info("getAboutPlaceOptions : ", req.value);
        var promise = PropertyType.getAboutPlaceOptions(req.value.params.propertyTypeId);
        promise.then((data) => {
            return res.json({ "response": { "data": data } });
        }).catch((err) => {
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    getAmenitiesByPropertyType: async (req, res, next) => {
        logger.info("getAmenitiesByPropertyType : ", req.value);
        var promise = PropertyType.getAmenitiesByPropertyType(req.value.params.propertyTypeId);
        promise.then((data) => {
            return res.json({ "response": { "data": data } });
        }).catch((err) => {
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    getPropertyInternal: async (req, res) => {
        logger.info("getPropertyInternal : ", req.value);
        var promise = PropertyType.getPropertyInternal(req.value.params.id);
        promise.then(
            (result) => {
                if (result.length == 0)
                    return res.status(404).json({ "details": [{ "message": __("listingNotFound") }] });
                else {
                    return res.json({ "response": { "data": result } });
                }
            }).catch((err) => {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            });
    },
    getPropertyDetails: async (req, res) => {
        logger.info("getPropertyDetails : ", req.value);

        var promise = PropertyType.propertyDetails(req.value.params.id);
        promise.then((result) => {

            console.log("getPropertyDetails", JSON.stringify(result));

            if (result.length == 0)
                return res.status(404).json({ "details": [{ "message": __("listingNotFound") }] });
            else {
                if (result[0].photos != null && result[0].photos != '') {
                    var photos = result[0].photos.split(",");
                    //result[0].photos= photos.map(httpHelper.photoObject);
                    result[0].photos = photos.map((x) => {
                        return httpHelper.photoObject(x, 'medium')
                    });
                } else {
                    //                    result[0].photos =  config.param.defaulPropertytImageObject
                    result[0].photos = [];
                }
                //console.log(result, "down");
                return res.json({ "response": { "data": result } });
            }
        }).catch((err) => {
            console.log(err)
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    publishProperty: async (req, res, next) => {
        logger.info("publishProperty : ", req.value);
        var headersLang = { "Accept-Language": getLocale() };
        var common = {};
        var promises = [];
		var isBroker = 0;
        var coupon_id = 0;
        var coupon_code = '';
        req.value.body.CouponDiscountAmt = 0;
        let userid = req.headers.userid;
        let header = {
            "userid": userid,
            "Accept-Language": getLocale()
        };
        planDetails = config.APIs.Common.resource.plandetails.replace(":planId", req.value.body.planId);
        promises.push(httpHelper.requestAPI(config.APIs.Common.URL, planDetails, "GET", "", headersLang));
        promises.push(PropertyType.propertyDetails(req.value.params.id));
        promises.push(httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.clientconfiguration.replace(":country", config.param.countryCode), "GET", "", headersLang));
        promises.push(httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.userinfo.replace(':userId', req.headers.userid), "GET", "", headersLang));
        Promise.all(promises)
            .then((data) => {
                let employee = 0;
                let manager = 0;				
                if (typeof data[3] !== 'undefined' && typeof data[3].response !== 'undefined' && typeof data[3].response.data !== 'undefined' && data[3].response.data.length) {
                    employee = parseInt(data[3].response.data[0].isemployee);
                    manager = parseInt(data[3].response.data[0].managerid);
					isBroker = parseInt(data[3].response.data[0].ismanager) == 2 ? 1 : 0;
                }
				if (isBroker === 1) {
					if(req.value.body.brokerConsent != 1){
						throw new cutomError(__("brokerConsentFailure"), 400);
					}
				}
				
                /*No plan details found*/
                if (data[0] == undefined || data[0].response.data.length == 0) {
                    throw new cutomError(__("invalidPlanChosen"), 400);
                }

                /*No listing found*/
                if (data[1] == undefined || data[1].length == 0) {
                    throw new cutomError(__("listingNotFound"), 404);
                }

                /*check if this property belongs to this user only or not*/
                if (data[1][0].userid != req.headers.userid && !employee) {
                    throw new cutomError(__("unauthProp"), 409);
                } else if (employee && data[1][0].userid != manager) {
                    throw new cutomError(__("unauthProp"), 409);
                }

                /*if property is already published*/
                if (data[1][0].publishstatus == 'P' && data[1][0].isExpired != 1) {
                    throw new cutomError(__("alreadyPublished"), 409);
                }

                common.planDetails = data[0].response.data[0];
                common.propertyDetails = data[1];
                common.property_publish_status = '';
                common.appointment_settings = {
                    appointment_status: 0,
                    appointment_price: 0
                };

                /* If property already published once and customer is going to use 100% discount(Free package second time) */
                if (data[1][0].publishstatus === 'E' && parseInt(common.planDetails.discount) === 100) {
                    throw new cutomError(__("freePackageAlreadyUsed"), 409);
                }

                /*** Publish Status settings, Appointment Settings ***/
                if (typeof data[2] !== 'undefined' && typeof data[2].response.data[0] !== 'undefined' && typeof data[2].response.data[0].countrySettings !== 'undefined' && data[2].response.data[0].countrySettings.length) {
                    common.property_publish_status = data[2].response.data[0].countrySettings[0].property_publish_status;
                    common.appointment_settings = {
                        appointment_status: parseInt(data[2].response.data[0].countrySettings[0].appointment_status),
                        appointment_price: data[2].response.data[0].countrySettings[0].appointment_price
                    };
                }
								
                if (typeof req.value.body.coupon_code != 'undefined' && req.value.body.coupon_code != '') {
                    var couponData = {
                        "code": req.value.body.coupon_code,
                        "codeType": "publish_property"
                    }
                    return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.applyPromoCode, "POST", couponData, header)
                        .then(response => {
                            if (typeof response.response.data != 'undefined' && typeof response.response.data[0].reward != 'undefined' && parseInt(response.response.data[0].reward) > 0) {
                                let applyPromoCodeResp = response.response.data[0];
                                coupon_id = parseInt(applyPromoCodeResp.id);
                                let maxRewardAmt =  parseInt(applyPromoCodeResp.max_reward);
                                let CouponDiscountAmt = 0;
                                if(typeof applyPromoCodeResp.discount_type != 'undefined' && parseInt(applyPromoCodeResp.discount_type) == 1){
                                    CouponDiscountAmt = parseInt(applyPromoCodeResp.reward);
                                }
                                else{
                                    CouponDiscountAmt = parseFloat(((common.planDetails.amount * applyPromoCodeResp.reward) / 100));
                                }

                                if(CouponDiscountAmt < maxRewardAmt){
                                    common.planDetails.amount = common.planDetails.amount - CouponDiscountAmt;
                                    req.value.body.CouponDiscountAmt = CouponDiscountAmt;
                                }
                                else{
                                    common.planDetails.amount = common.planDetails.amount - maxRewardAmt;
                                    req.value.body.CouponDiscountAmt = maxRewardAmt;
                                }
                                common.planDetails.amount = parseFloat(common.planDetails.amount);
                            }
                        }).catch(err => {
                            logger.error(err);
                            if (err.type != undefined) {
                                throw new cutomError(err.message, 409);
                            }
                            else if (typeof err.message.details != 'undefined') {
                                throw new cutomError(err.message.details[0].message, 409);
                            }
                            else {
                                logger.error(err);
                                throw new cutomError(__("internalServer"), 409);
                            }
                        });
                }
                else {
                    return '';
                }
            })
			.then(() => {
				if(isBroker == 1){
                    PropertyType.updateBrokerConsent(common.propertyDetails[0].id, 1, (err, results) => { // pending broker Consent at this moment
                        if (!err) {
                            return '';
                        }
						else{
							console.log("Broker Consent update err!! ", err);
							logger.error(err);
							throw new cutomError(__("internalServer"), 409);							
						}
                    });
				}
				else{
					return '';
				}				
			})
            .then(() => {
                /*Paid Plan AND No Skip Payment*/
                if (common.planDetails.amount > 0 && (req.value.body.skip_payment == undefined || req.value.body.skip_payment != 1)) {
                    if (req.value.body.device == 'mobile') {
                        paymentResource = config.APIs.Payment.resource.generatekeyrsa;
                        paymentData = { "transactionType": "buy_plan_publish_property", "transactionAmount": common.planDetails.amount, "property_id": req.value.params.id, "merchant_param4": req.value.body.planId.toString(), "coupon_code": req.value.body.coupon_code, "coupon_id": coupon_id, "additional_parameters":JSON.stringify({"coupon_discount_amt":(req.value.body.CouponDiscountAmt != undefined && req.value.body.CouponDiscountAmt != "") ? req.value.body.CouponDiscountAmt : 0}) };
                    } else {
                        paymentData = { "transactionType": "buy_plan_publish_property", "transactionAmount": common.planDetails.amount, "merchant_param2": req.value.params.id, "merchant_param3": req.value.body.planId.toString(), "coupon_code": req.value.body.coupon_code, "coupon_id": coupon_id, "additional_parameters":JSON.stringify({"coupon_discount_amt":(req.value.body.CouponDiscountAmt != undefined && req.value.body.CouponDiscountAmt != "") ? req.value.body.CouponDiscountAmt : 0}) };
                        paymentResource = config.APIs.Payment.resource.getpaymentrequestdata;
                    }
                    httpHelper.requestAPI(config.APIs.Payment.URL, paymentResource, "POST", paymentData, header).then(response => {
                        return res.status(200).json({ "response": { "data": response.response.data } });
                    }).catch(err => {
                        console.log(err);
                        logger.error(err);
                        if (err.type != undefined) {
                            return res.status(err.type).json({ "details": [{ "message": err.message }] });
                        } else if (err.message.details != undefined) {
                            return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
                        } else {
                            logger.error(err);
                            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                        }
                    });
                } else if ((common.planDetails.amount == 0) || (req.value.body.skip_payment != undefined && req.value.body.skip_payment == 1)) {
                    /*Free Plan OR SKIP PAYMENT*/

                    /* Check If user is already purchased free plan once */
                    PropertyType.countPropertyPublshPlan(req.headers.userid, req.value.body.planId, (err, results) => {
                        if (!err) {
                            if (results.plan_used_count > 0) {
                                return res.status(409).json({ "details": [{ "message": __("freePackageAlreadyUsed") }] });
                            }
                            else {
                                PropertyType.savePropertyPublishPlan(req.headers.userid, req.value.params.id, req.value.body.planId);
                                selfPropType.publishPropertySendEmail(res, common.propertyDetails[0].freeattempt, common.propertyDetails[0], common.planDetails.free_relist_attempt, req.value.params.id, common.planDetails.duration, req.headers.userid, common.property_publish_status, 0);
                            }
                        }
                    });
                }
            }).catch((err) => {
                console.log("err", JSON.stringify(err));
                if (err.type != undefined)
                    return res.status(err.type).json({ "details": [{ "message": err.message }] });
                else if (err.message.details != undefined) {
                    return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
                } else {
                    logger.error(err);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })
    },

    /* Check Property before Publis Payment microservice */
    publishPropertyValidate: async (req, res, next) => {
        logger.info("publishPropertyValidate : ", req.value);
        var headersLang = { "Accept-Language": getLocale() };
        var promises = [];
        planDetails = config.APIs.Common.resource.plandetails.replace(":planId", req.value.body.planId);
        promises.push(PropertyType.propertyDetails(req.value.params.id));
        promises.push(httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.clientconfiguration.replace(":country", config.param.countryCode), "GET", "", headersLang));
        promises.push(httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.userinfo.replace(':userId', req.headers.userid), "GET", "", headersLang));
        promises.push(httpHelper.requestAPI(config.APIs.Common.URL, planDetails, "GET", "", headersLang));
        Promise.all(promises).then((data) => {
            let employee = 0;
            let manager = 0;
            if (typeof data[2] !== 'undefined' && typeof data[2].response !== 'undefined' && typeof data[2].response.data !== 'undefined' && data[2].response.data.length) {
                employee = parseInt(data[2].response.data[0].isemployee);
                manager = parseInt(data[2].response.data[0].managerid);
            }

            if (data[0] == undefined || data[0].length == 0) { /*No listing found*/
                return res.status(404).json({ "details": [{ "message": __("listingNotFound") }] });
            }

            if (data[0][0].userid != req.headers.userid && !employee) { /*check if this property belongs to this user only or not*/
                return res.status(409).json({ "details": [{ "message": __("unauthProp") }] });
            }
            else if (employee && data[0][0].userid != manager) {
                return res.status(409).json({ "details": [{ "message": __("unauthProp") }] });
            }

            if (data[0][0].publishstatus == 'P') {  /*if property is already published*/
                return res.status(409).json({ "details": [{ "message": __("alreadyPublished") }] });
            }
            var planDetails = data[3].response.data[0];
            if (planDetails.status != undefined && planDetails.status == 'active') {
                return res.status(200).json({ "details": [{ "message": "OK" }] });
            }
            else {
                return res.status(409).json({ "details": [{ "message": __("invalidPlanChosen") }] });
            }
        }).catch((err) => {
            console.log(' catch catch' + err);
            if (err.type != undefined) {
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            }
            else if (err.message.details != undefined) {
                return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
            }
            else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        })
    },

    /* Publish Property from CC Avenue Payment microservice */
    publishPropertyforCcAvenue: async (req, res, next) => {
        logger.info("publishPropertyforCcAvenue : ", req.value);
        var headersLang = { "Accept-Language": getLocale() };
        var common = {};
        var promises = [];
        planDetails = config.APIs.Common.resource.plandetails.replace(":planId", req.value.body.planId);
        promises.push(PropertyType.propertyDetails(req.value.params.id));
        promises.push(httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.clientconfiguration.replace(":country", config.param.countryCode), "GET", "", headersLang));
        promises.push(httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.userinfo.replace(':userId', req.headers.userid), "GET", "", headersLang));
        promises.push(httpHelper.requestAPI(config.APIs.Common.URL, planDetails, "GET", "", headersLang));
        Promise.all(promises).then((data) => {
            let employee = 0;
            let manager = 0;
            if (typeof data[2] !== 'undefined' && typeof data[2].response !== 'undefined' && typeof data[2].response.data !== 'undefined' && data[2].response.data.length) {
                employee = parseInt(data[2].response.data[0].isemployee);
                manager = parseInt(data[2].response.data[0].managerid);
            }

            if (data[0] == undefined || data[0].length == 0) { /*No listing found*/
                return res.status(404).json({ "details": [{ "message": __("listingNotFound") }] });
            }

            if (data[0][0].userid != req.headers.userid && !employee) { /*check if this property belongs to this user only or not*/
                return res.status(409).json({ "details": [{ "message": __("unauthProp") }] });
            }
            else if (employee && data[0][0].userid != manager) {
                return res.status(409).json({ "details": [{ "message": __("unauthProp") }] });
            }

            if (data[0][0].publishstatus == 'P' && data[0][0].isExpired != 1) {  /*if property is already published*/
                return res.status(409).json({ "details": [{ "message": __("alreadyPublished") }] });
            }

            var planDetails = data[3].response.data[0];
            if (planDetails.status != undefined && planDetails.status == 'active') {
                common.planDetails = data[3].response.data[0];
                common.propertyDetails = data[0];
                common.property_publish_status = '';
                // Publish Status settings, Appointment Settings
                if (typeof data[1] !== 'undefined' && typeof data[1].response.data[0] !== 'undefined' && typeof data[1].response.data[0].countrySettings !== 'undefined' && data[1].response.data[0].countrySettings.length) {
                    common.property_publish_status = data[1].response.data[0].countrySettings[0].property_publish_status;
                }

                selfPropType.publishPropertySendEmail(res, common.propertyDetails[0].freeattempt, common.propertyDetails[0], common.planDetails.free_relist_attempt, req.value.params.id, common.planDetails.duration, req.headers.userid, common.property_publish_status, 1);
            }
            else {
                return res.status(409).json({ "details": [{ "message": __("invalidPlanChosen") }] });
            }

        }).catch((err) => {
            console.log(' catch catch' + err);
            if (err.type != undefined) {
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            }
            else if (err.message.details != undefined) {
                return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
            }
            else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        })
    },


    paymentWithExistingMethodSendEmail: (res, userid, bodyRequest, propertyId, planDetails, propertyDetails, property_publish_status, appointment_settings) => {
        console.log('Inside paymentWithExistingMethodSendEmail');

        let utcToday = moment().utc().format('YYYY-MM-DD HH:mm:ss');
        let nztoday = httpHelper.zoneConvertFromTo(utcToday, 'UTC', config.param.currentZone, 1);
        let header = { "userid": userid, "Accept-Language": getLocale() };
        let body = {
            "smstype": bodyRequest.smstype,
            "payment_otp": bodyRequest.payment_otp,
            "uid": userid,
            "to_uid": "-1",
            "from_uid_role": "2",
            "to_uid_role": "5",
            "property_id": propertyId,
            "lease_id": "0",
            "ref_id1": bodyRequest.planId,
            "payment_reason": "buy_plan_publish_property",
            "payment_frequency": "onetime",
            "start_date": nztoday,
            "end_date": nztoday,
            "total_amount": planDetails.amount,
            "pay_methods": [
                {
                    "id": bodyRequest.existing.wcb_id,
                    "amount": planDetails.amount,
                    "payment_method": bodyRequest.existing.payment_method
                }
            ]
        };
        return httpHelper.requestAPI(config.APIs.Payment.URL, config.APIs.Payment.resource.paynow, "POST", body, header)
            .then(function (paymentStatus) {

                if ((paymentStatus != undefined && paymentStatus.details[0].extra == 'successful')) {
                    selfPropType.publishPropertySendEmail(res, propertyDetails[0].freeattempt, propertyDetails[0], planDetails.free_relist_attempt, propertyId, planDetails.duration, userid, property_publish_status, 0);
                }
                else if (paymentStatus.details[0].extra == 'processing') {
                    selfPropType.updatePropertyStatus(propertyId, 'PW');
                    throw new cutomError(__("paymentProcessing"), 200);
                }
                else {
                    /*Failed*/
                    throw new cutomError(__("paymentNotSuccessful"), 409);
                }
            }).catch(function (err1) {

                if (err1.type != undefined) {
                    return res.status(err1.type).json({ "details": [{ "message": err1.message }] });
                }
                else if (err1.message.details.length != 0) {
                    return res.status(err1.statusCode).json({ "details": [{ "message": err1.message.details[0].message }] });
                } else {
                    logger.error(err1);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })
    },

    updateAdminPropStatus: (propId, status) => {
        PropertyType.updatePropertyAdminStatus(propId, status);
    },
    updatePropStatus: async (req, res, next) => {
        logger.info("updatePropStatus : ", req.value);
        console.log('Inside updatePropStatus', req.value.params.id, req.value.params.status)

        selfPropType.updatePropertyStatus(req.value.params.id, req.value.params.status);
        return res.json({ "details": [{ "message": __("propStatusUpdated") }] });
    },
    updatePropertyStatus: (propId, status) => {
        return PropertyType.updatePropertyStatus(propId, status);
    },
    saveCCMakePaymentSendEmail: (res, userid, bodyRequest, propertyId, planDetails, propertyDetails, property_publish_status, appointment_settings) => {
        console.log("Inside saveCCMakePaymentSendEmail", bodyRequest.pay_by_token)

        let header = { "userid": userid, "Accept-Language": getLocale() }
        let body = { "tmp_token": bodyRequest.pay_by_token, "direct_payment": "1" }
        return httpHelper.requestAPI(config.APIs.Payment.URL, config.APIs.Payment.resource.savecc, "POST", body, header)
            .then(function (tokensaved) {
                if (tokensaved.details[0].extra != undefined && tokensaved.details[0].extra == 'success') {

                    /*Credit Card Saved. Now make payment with this card*/
                    bodyRequest.existing = {}
                    bodyRequest.existing.wcb_id = tokensaved.details[0].token;
                    bodyRequest.existing.payment_method = 'credit_card';
                    selfPropType.paymentWithExistingMethodSendEmail(res, userid, bodyRequest, propertyId, planDetails, propertyDetails, property_publish_status, appointment_settings);
                    console.log("tokensaved.details[0].token", tokensaved.details[0].token)
                }
            }).catch(function (err) {
                console.log("err inside save cc", err)
                if (err.type != undefined)
                    return res.status(err.type).json({ "details": [{ "message": err.message }] });
                else if (err.statusCode != undefined) {
                    return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
                } else {
                    logger.error(err);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })
    },

    publishPropertySendEmail: (res, propertyFreeAttempt, propertyDetail, planFreeAttempt, propertyId, planDuration, userId, property_publish_status, oncePaidPlan) => {
        var headersLang = { "Accept-Language": getLocale() };
        var adminpublishStatus = 'A';
        var propertyAddress = '';
        if (typeof property_publish_status !== 'undefined' && property_publish_status !== 'A') {
            var adminpublishStatus = 'P';
        }
		var propertyPublishStatus = 'P';
		var propPublishGeneral = 1;
		var propPublishViolate = 0;
		if( typeof propertyDetail.adminpublishstatus != 'undefined' && propertyDetail.adminpublishstatus == 'V' ){
			adminpublishStatus = 'P'; // send property for admin approval
			propertyPublishStatus = 'D';
			propPublishGeneral = 0;
			propPublishViolate = 1;
		}
        return PropertyType.publishProperty(propertyId, planFreeAttempt, planDuration, adminpublishStatus, oncePaidPlan, propertyPublishStatus)
            .then(function (propertyInfo) {
                propertyAddress = propertyInfo[0][0].address;
                //send wall notification and email now
                userinfo = config.APIs.user.resource.userinfo.replace(":userId", userId);
                return httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang)
            }).then(function (userinfo) {
                userinfo1 = userinfo.response.data[0];
                //wall notification
                let notificationData = { "title": __("propertyPublishedTitleNotf"), "description": __("propertyPublishedDesc") }
                let addNotification = config.APIs.notification.resource.addNotification.replace(":userId", userId);
                //email notification
                let data = { "template": "propertyPublished", "placeholder": { "fullname": userinfo1.fullname, propertyaddress: propertyAddress, 'propPublishGeneral':propPublishGeneral,'propPublishViolate':propPublishViolate }, "to": userinfo1.email, "subject": __("propertyPublishedTitle"), "userId": userId };
                var promises = [];
                //promises.push( PropertyType . updatePropCount(userId) );
                promises.push(httpHelper.requestAPI(config.APIs.notification.URL, addNotification, "POST", notificationData, headersLang));
                promises.push(httpHelper.requestAPI(config.APIs.notification.URL, config.APIs.notification.resource.sendmail, "POST", data, headersLang));

                if (typeof propertyDetail.is_feature_property !== 'undefined' && propertyDetail.is_feature_property === 1) {
                    let previewPropLink = config.APIs.Web.URL + config.APIs.Web.resource.viewPropPage.replace(':id', propertyId);
                    let featuredPropMailData = {
                        template: "featuredProperty",
                        placeholder: {
                            propertyaddress: propertyDetail.address,
                            PROPVIEWLINK: previewPropLink
                        },
                        to: config.param.marketingSupportEmail,
                        subject: __("featuredPropertyPublished"),
                    };
                    httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", featuredPropMailData).then(riskMail => {
                        console.log(riskMail);
                    }).catch(riskMailError => {
                        console.log("riskMailError", riskMailError);
                    });
                }
                Promise.all(promises).then((data) => {
                    console.log("notifications sent")
                }).catch((err) => {
                    logger.error("Error caught on send notifications in publish property : ", err);
                    console.log("err in notification is ", err)
                });
                return res.json({ "details": [{ "message": __("propPublished") }] });
            }).catch(function (err2) {
                logger.error(err2);
                console.log("err2 in publish prop is ", err2);
            });
    },

    getBasicSearch: async (req, res, next) => {
        console.log("Inside getBasicSearch..........");
        if (typeof req.headers.userid === 'undefined') {
            req.headers.userid = '-1';
        }
        req.value.body.uuid_userid = '';

        if(typeof req.value.body.isbroker == 'undefined' || req.value.body.isbroker == ''){
            req.value.body.isbroker = 0;
        }

        if(typeof req.value.body.uuid != 'undefined' && req.value.body.uuid != ''){
            let isValiduuid = validate(req.value.body.uuid,5);
            if(isValiduuid){
                await httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.getuserbyudid.replace(':uid', req.value.body.uuid), "GET", '')
                .then(response => {
                    if(typeof response.response.data[0].userid != 'undefined'){
                        req.value.body.uuid_userid = response.response.data[0].userid;
                    }
                }).catch(error => {
                    console.log("Error Response from getuserbyudid", error);                    
                    return res.status(409).json({ "details": [{ "message": __("noSuchUserExist") }] });
                });
            }
            else{
                logger.error('Invalid UUID : ', req.value.body.uuid);
                return res.status(400).json({ "details": [{ "message": __("invalidUUID") }] });
            }
        }
        logger.info("getBasicSearch : ", req.value);
        if (req.value.body.searchstr != undefined && req.value.body.searchstr != '') {
            var abc = "";
            searchstr = req.value.body.searchstr.replace(/,/g, "");
            searchstr = searchstr.replace(/_/g, "\\_");
            searchstr = searchstr.replace(/'/g, "\\'");
            searchstr = searchstr.replace(/%/g, "\\%").split(" ");
            searchstr.forEach((str) => {
                abc += (abc != '') ? " and (address like '%" + str + "%' or  city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')" : "(address like '%" + str + "%' or city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')";
            })
            req.value.body.searchstr = abc;
        }
        var promise = PropertyType.getBasicSearch(req.value.body, req.headers.userid);
        promise.then((result) => {
            if (result[0].length == 0) {
                return res.json({ "details": [{ "message": __("listingNotFoundSearch") }] });
            } else {
                var totalRows = result[1][0].totalCount;
                result[0].forEach((element) => {
                    if (element.fieldvalues != null) {
                        element.fieldvalues = JSON.parse(element.fieldvalues);
                    }
                    if (element.photos != null && element.photos != '') {
                        var photos = element.photos.split(",");
                        element.photos = [httpHelper.photoObject(photos[0], 'medium')]

                        /*element.photos = photos.map((x) => {
                            return httpHelper.photoObject(x, 'medium')
                        });*/
                    } else {
                        element.photos = config.param.defaulPropertytImageObject
                    }
                });
                if (req.headers.userid === '-1') {
                    result[0] = _.map(result[0], (obj) => {
                        obj.address = 'XXXX XXXX XXXXXXXXX';
                        obj.suite_unit_bldg_flr = 'XX';
                        obj.streetno = 'XXX';
                        // obj.city_town = 'XXXXXXX';
                        // obj.state_province_region = 'XXXXXXX';
                        obj.zip_postcode = 'XXXXXX';
                        obj.streetname = 'XXXXXXXXXXXXX';
                        return obj;
                    });
                }
                //map search Data 
                result[2].forEach((element) => {

                    if (element.photos != null && element.photos != '') {
                        var photos = element.photos.split(",");
                        //element.photos= photos.map(httpHelper.photoObject);
                        let i = 0;
                        element.photos = [httpHelper.photoObject(photos[0], 'medium')]

                        /*element.photos = photos.map((x) => {
                             i++;
                            if(i > 1){
                                break;
                            }
                            return httpHelper.photoObject(x, 'medium')
                        });*/
                    } else {
                        element.photos = config.param.defaulPropertytImageObject
                    }
                    if (req.headers.userid === '-1') {
                        // element.city_town = 'XXXXXXX';
                        // element.state_province_region = 'XXXXXXX';
                    }
                });
                result[0] = selfPropType.__hideExploreAddress(result[0]);
                return res.json({ "response": { "data": { "totalRows": totalRows, "recordSet": result[0], "mapSearchData": result[2] } } })
            }
        }).catch((err) => {
            console.log(err)
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    __hideExploreAddress: (searchedData) => {
        searchedData = _.map(searchedData, (obj) => {
            if (!parseInt(obj.isshow_full_address)) {
                let addressArr = [obj.city_town, obj.state_province_region, obj.zip_postcode];
                obj.address = addressArr.join(', ');
            }
            return obj;
        });
        return searchedData;
    },
    getBasicSearchMobile: async (req, res, next) => {
        if (typeof req.headers.userid === 'undefined') {
            req.headers.userid = '-1';
        }
        logger.info("getBasicSearchMobile : ", req.value);

        if(typeof req.value.body.isbroker == 'undefined' || req.value.body.isbroker == ''){
            req.value.body.isbroker = 0;
        }

        if (req.value.body.searchstr != undefined && req.value.body.searchstr != '') {
            var abc = "";
            searchstr = req.value.body.searchstr.replace(/,/g, "");
            searchstr = searchstr.replace(/_/g, "\\_");
            searchstr = searchstr.replace(/%/g, "\\%").split(" ");
            searchstr.forEach((str) => {
                abc += (abc != '') ? " and (address like '%" + str + "%' or  city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')" : "(address like '%" + str + "%' or city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')";
            })
            req.value.body.searchstr = abc;
        }
        // console.log(req.value.body)
        var promise = PropertyType.getBasicSearch(req.value.body, req.headers.userid);
        promise.then((result) => {
            if (result[0].length == 0) {
                return res.json({ "details": [{ "message": __("listingNotFoundSearch") }] });
            } else {
                var totalRows = result[1][0].totalCount;
                result[0].forEach((element) => {
                    if (element.fieldvalues != null) {
                        element.fieldvalues = JSON.parse(element.fieldvalues);
                    }
                    if (element.photos != null && element.photos != '') {
                        var photos = element.photos.split(",");
                        //element.photos= photos.map(httpHelper.photoObject);
                        element.photos = photos.map((x) => {
                            return httpHelper.photoObject(x, 'medium')
                        });
                    } else {
                        element.photos = config.param.defaulPropertytImageObject
                    }
                    delete element.listcatparentid;
                    delete element.propertyid;
                    delete element.userid;
                    delete element.publishstatus;
                    delete element.isshow_full_address;
                    delete element.listcatconfigid;
                    delete element.isimmediateavailable;
                });
                if (req.headers.userid === '-1') {
                    result[0] = _.map(result[0], (obj) => {
                        obj.address = 'XXXX XXXX XXXXXXXXX';
                        obj.suite_unit_bldg_flr = 'XX';
                        obj.streetno = 'XXX';
                        // obj.city_town = 'XXXXXXX';
                        // obj.state_province_region = 'XXXXXXX';
                        obj.zip_postcode = 'XXXXXX';
                        obj.streetname = 'XXXXXXXXXXXXX';
                        return obj;
                    });
                }
                //map search Data 
                result[2].forEach((element) => {

                    if (element.photos != null && element.photos != '') {
                        var photos = element.photos.split(",");
                        //element.photos= photos.map(httpHelper.photoObject);
                        let i = 0;
                        element.photos = [httpHelper.photoObject(photos[0], 'medium')]

                        /*element.photos = photos.map((x) => {
                             i++;
                            if(i > 1){
                                break;
                            }
                            return httpHelper.photoObject(x, 'medium')
                        });*/
                    } else {
                        element.photos = config.param.defaulPropertytImageObject
                    }
                    if (req.headers.userid === '-1') {
                        // element.city_town = 'XXXXXXX';
                        // element.state_province_region = 'XXXXXXX';
                    }
                });
                result[0] = selfPropType.__hideExploreAddress(result[0]);
                return res.json({ "response": { "data": { "totalRows": totalRows, "recordSet": result[0], "mapSearchData": result[2] } } })
            }
        }).catch((err) => {
            console.log(err)
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    getSearchFilter: async (req, res, next) => {
        logger.info("getSearchFilter : ", req.value);
        var promise = PropertyType.getSearchFilter(req.value.params.pcatid, req.value.params.catid);
        promise.then((result) => {
            var result1 = {};
            result1.price_range = result[0];
            result1.about = result[1];
            result1.amenities = result[2];
            return res.json({ "response": { "data": result1 } });
        }).catch((err) => {
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    recommendedProperties: async (req, res, next) => {
        logger.info("recommendedProperties : ", req.headers.userid);
        var promise = PropertyType.recommendedProperties(req.headers.userid, req.value.params.offset, req.value.params.noofrecord);
        promise.then((result) => {
            if (result[0].length == 0) {
                return res.json({ "details": [{ "message": __("listingNotFoundRecommend") }] });
            } else {
                var totalRows = result[1][0].totalCount;
                result[0].forEach((element) => {
                    if (element.fieldvalues != null) {
                        element.fieldvalues = JSON.parse(element.fieldvalues);
                    }
                    if (element.photos != null && element.photos != '') {
                        var photos = element.photos.split(",");
                        element.photos = photos.map((x) => {
                            return httpHelper.photoObject(x, 'medium')
                        });
                    } else {
                        element.photos = config.param.defaulPropertytImageObject
                    }
                });
                return res.json({ "response": { "data": { "totalRows": totalRows, "recordSet": result[0] } } })
            }
        }).catch((err) => {
            console.log(err)
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    recommendedPropertiesMobiles: async (req, res, next) => {
        logger.info("recommendedPropertiesMobiles : ", req.headers.userid);
        var promise = PropertyType.recommendedProperties(req.headers.userid, req.value.params.offset, req.value.params.noofrecord);
        promise.then((result) => {
            if (result[0].length == 0) {
                return res.json({ "details": [{ "message": __("listingNotFoundRecommend") }] });
            } else {
                var totalRows = result[1][0].totalCount;
                result[0].forEach((element) => {
                    if (element.fieldvalues != null) {
                        element.fieldvalues = JSON.parse(element.fieldvalues);
                    }
                    if (element.photos != null && element.photos != '') {
                        var photos = element.photos.split(",");
                        element.photos = photos.map((x) => {
                            return httpHelper.photoObject(x, 'medium')
                        });
                    } else {
                        element.photos = config.param.defaulPropertytImageObject
                    }
                    delete element.listcatparentid;
                    delete element.propertyid;
                    delete element.userid;
                    delete element.publishstatus;
                    delete element.isshow_full_address;
                    delete element.listcatconfigid;
                    delete element.isimmediateavailable;
                });
                return res.json({ "response": { "data": { "totalRows": totalRows, "recordSet": result[0] } } })
            }
        }).catch((err) => {
            console.log(err);
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    leasedPropeties: async (req, res, next) => {
        logger.info("leasedPropeties : ", req.value.params);
        var promise = PropertyType.leasedPropeties(req.headers.userid, req.value.params.role);
        promise.then((result) => {
            return res.json({ "response": { "data": result } });
        }).catch((err) => {
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },

    addRentalproperty: async (req, res, next) => {

        /*
        * 100 => Renter Limit Exceeded
        * 101 => Landlord Limit Exceeded
        * 102 => Renter minimum Transaction
        * 103 => Landlord minimum transaction
        * 104 => Renter Maximum transaction
        * 105 => Landlord Maximum transaction
        * 106 => Renter Max monthly transaction
        * 107 => Landlord Max monthly transaction
        */
        logger.info("addRentalproperty payment:", req.value, req.headers.userid);
        let commonData = {
            transactionRules: [],
            leaseStatus: 'Pending',
            error: [],
            message: '',
            renterId: 0,
            landlordId: 0,
            otherUser: [],
            from_role: 0,
            to_role: 0,
            transactionDetails: {},
            /**newly added keys */
            selfUserInfo: {}
        };
        var hasWallet = true;
        var provider_id;
        var wallet_cc_ba_id = '';
        var payment_method = '';
        var invalidAmountBreak = 0;
        async.waterfall([
            (callback) => {
                httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.clientconfiguration.replace(':country', config.param.countryCode), "GET", '').then(response => {
                    commonData.configuration = response.response.data[0].countrySettings;
                    callback(null);
                }).catch(error => {
                    console.log('clientconfiguration Error', error);
                    callback(error, { responseCode: 500, message: __("internalServer") });
                });
            },
            (callback) => {
                PropertyType.getParentCategory(req.value.body.listcatconfigid).then(response => {
                    req.value.body.parentCatid = response.parentid;
                    callback(null);
                }).catch(error => {
                    callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                });
            },
            (callback) => {
                if (typeof req.value.body.security_deposit === 'undefined' || req.value.body.security_deposit === null) {
                    req.value.body.security_deposit = 0;
                }
                if (typeof req.value.body.notice_period_renter === 'undefined' || req.value.body.notice_period_renter === null) {
                    req.value.body.notice_period_renter = 0;
                }
                if (typeof req.value.body.notice_period_lister === 'undefined' || req.value.body.notice_period_lister === null) {
                    req.value.body.notice_period_lister = 0;
                }
                if (typeof req.value.body.lease_document === 'undefined' || req.value.body.lease_document === null) {
                    req.value.body.lease_document = '';
                }
                if (typeof req.value.body.additional_clause === 'undefined') {
                    req.value.body.additional_clause = '';
                }
                if (typeof req.value.body.lease_startdate === 'undefined') {
                    req.value.body.lease_startdate = null;
                }
                if (typeof req.value.body.lease_enddate === 'undefined') {
                    req.value.body.lease_enddate = null;
                }
                if (typeof req.value.body.paymentfreq === 'undefined') {
                    req.value.body.paymentfreq = 'Monthly';
                }
                req.value.body.paymentfreq = req.value.body.paymentfreq.toLowerCase();
                httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.transactionRules.replace(':country', config.param.countryCode).replace(':categoryid', req.value.body.parentCatid), "GET", '').then(response => {
                    commonData.transactionRules = response.response.data;
                    callback(null);
                }).catch(error => {
                    console.log('transactionRules Error', error);
                    callback(error, { responseCode: 500, message: __("internalServer") });
                });
            },
            (callback) => {
                if (parseInt(req.value.params.role) === 1 && req.value.body.service_charge_to_lister === '') {
                    callback(__("validation.require.service_charge_to_lister"), { responseCode: 400, message: __("validation.require.service_charge_to_lister") });
                    return false;
                }
                else if (parseInt(req.value.params.role) !== 1) {
                    req.value.body.service_charge_to_lister = 0;
                }
                callback(null);
            },
            /**Below Added by Monika - Starts */
            (callback) => {
                httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.userinfo.replace(':userId', req.headers.userid), "GET", '').then(response => {
                    commonData.selfUserInfo = response.response.data.length > 0 ? response.response.data[0] : {};
                    callback(null);
                }).catch(error => {
                    callback(error, { responseCode: 500, message: __("internalServer") });
                });
            },
            /**Above Added by Monika - Ends */
            (callback) => {
                /*
                * Other Role user detail
                */
                if (parseInt(req.value.params.role) === 1) {
                    let requestData = { "email": req.value.body.email };
                    httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.userInfoByEmail, "POST", requestData).then(userInfo => {
                        commonData.otherUser = userInfo.data;
                        if (userInfo.data.length) {
                            if (parseInt(userInfo.data[0].ismanager) === 1) {
                                callback(__("managerInviteNotAllowed"), { responseCode: 400, message: __("managerInviteNotAllowed") });
                                return false;
                            }
                        }
                        callback(null);
                    }).catch(err => {
                        if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404)) {
                            callback(err, { responseCode: err.type, message: err.message });
                        }
                        else {
                            callback(err, { responseCode: 500, message: __("internalServer") });
                        }
                    });
                } else {
                    callback(null);
                }
            },
            (callback) => {
                /*
                * Last Transaction Amounts
                */
                httpHelper.requestAPI(config.APIs.Payment.URL, config.APIs.Payment.resource.getTransactionReport.replace(':userid', req.headers.userid), "GET", '').then(response => {
                    if (!response.data[0].totalMonthlyAmt) { // Null Handle
                        response.data[0].totalMonthlyAmt = 0;
                    }
                    commonData.transactionDetails[req.headers.userid] = response.data[0];
                    if (!commonData.otherUser.length) {
                        callback(null);
                    }
                    else {
                        httpHelper.requestAPI(config.APIs.Payment.URL, config.APIs.Payment.resource.getTransactionReport.replace(':userid', commonData.otherUser[0].id), "GET", '').then(otherUserT => {
                            if (!otherUserT.data[0].totalMonthlyAmt) { // Null Handle
                                otherUserT.data[0].totalMonthlyAmt = 0;
                            }
                            commonData.transactionDetails[commonData.otherUser[0].id] = otherUserT.data[0];
                            callback(null);
                        }).catch(otherUserTError => {
                            callback(otherUserTError, { responseCode: 500, message: __("internalServer") });
                        });
                    }
                }).catch(error => {
                    callback(error, { responseCode: 500, message: __("internalServer") });
                });
            },
            (callback) => {
                /*
                * Boot Voilation Messages List
                */
                httpHelper.requestAPI(config.APIs.Common.URL, config.APIs.Common.resource.getViolationMessages, "GET", '').then(violationMessages => {
                    let messages = {};
                    _.each(violationMessages.response.data, (val) => {
                        messages[val.code] = val.message;
                    });
                    commonData.violationMessages = messages;
                    callback(null);
                }).catch(error => {
                    callback(error, { responseCode: 500, message: __("internalServer") });
                });
            },
            (callback) => {

                let amountMonthly = utilityHelper.calculateMonthlyAmount(req.value.body.rent_amount, req.value.body.paymentfreq);

                let otherRole = parseInt(req.value.params.role);
                let currentRole = (otherRole === 1) ? 2 : 1;

                if (currentRole == 2 && commonData.selfUserInfo.ismanager == 1) {
                    /**Current user is a property manager */
                    currentRole = "-1";
                }
               
                if (commonData.otherUser.length > 0 && otherRole == 2 && commonData.otherUser[0].ismanager == 1) {
                    /**Other user is a property manager */
                    otherRole = "-1";
                }

                commonData.from_role = currentRole;
                let currentTransactionRule = _.filter(commonData.transactionRules, function (obj) {
                    return parseInt(obj.role) === parseInt(currentRole);
                });

                if (currentRole == 1) {
                    currentTransactionRule[0].max_properties = commonData.configuration.renter_property_max;
                }
                else if (currentRole == 2) {
                    currentTransactionRule[0].max_properties = commonData.configuration.landlord_property_max;
                }
                else {
                    currentTransactionRule[0].max_properties = commonData.configuration.manager_property_max;
                }
              
                commonData.to_role = otherRole;
                let otherTransactionRule = _.filter(commonData.transactionRules, function (obj) {
                    return parseInt(obj.role) === parseInt(otherRole);
                });
                
                if (otherRole == 1) {
                    otherTransactionRule[0].max_properties = commonData.configuration.renter_property_max;
                }
                else if (otherRole == 2) {
                    otherTransactionRule[0].max_properties = commonData.configuration.landlord_property_max;
                }
                else {
                    otherTransactionRule[0].max_properties = commonData.configuration.manager_property_max;
                }
              
                if (currentRole === 1) {
                    /*
                    * Renter invitation Rules
                    */

                    PropertyType.countRentedProperties(req.headers.userid).then(response => {

                        if (currentTransactionRule.length) {
                            if (response.current_leases >= currentTransactionRule[0].max_properties) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(100);
                                commonData.renterId = req.headers.userid;
                            }

                            if (parseFloat(currentTransactionRule[0].min_transaction_amount) > parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(102);
                                commonData.renterId = req.headers.userid;
                                invalidAmountBreak = parseFloat(currentTransactionRule[0].min_transaction_amount);
                            }
                            if (parseFloat(currentTransactionRule[0].max_transaction_amount) < parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(104);
                                commonData.renterId = req.headers.userid;
                                invalidAmountBreak = parseFloat(currentTransactionRule[0].max_transaction_amount);
                            }
                            if (typeof commonData.transactionDetails[req.headers.userid] !== 'undefined') {
                                let newMonthlyAmount = parseFloat(commonData.transactionDetails[req.headers.userid].totalMonthlyAmt) + parseFloat(amountMonthly);
                                if (newMonthlyAmount > currentTransactionRule[0].max_monthly_amount) {
                                    commonData.leaseStatus = 'Pending-Approval';
                                    commonData.error.push(106);
                                    commonData.renterId = req.headers.userid;
                                    invalidAmountBreak = parseFloat(currentTransactionRule[0].max_monthly_amount);
                                }
                            }
                        }

                        if (otherTransactionRule.length && commonData.otherUser.length) {
                            if (parseFloat(otherTransactionRule[0].min_transaction_amount) > parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(103);
                                commonData.landlordId = commonData.otherUser[0].id;
                                invalidAmountBreak = parseFloat(otherTransactionRule[0].min_transaction_amount);
                            }
                            if (parseFloat(otherTransactionRule[0].max_transaction_amount) < parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(105);
                                commonData.landlordId = commonData.otherUser[0].id;
                                invalidAmountBreak = parseFloat(otherTransactionRule[0].max_transaction_amount);
                            }
                            if (typeof commonData.transactionDetails[commonData.otherUser[0].id] !== 'undefined') {
                                let newMonthlyAmount = parseFloat(commonData.transactionDetails[commonData.otherUser[0].id].totalMonthlyAmt) + parseFloat(amountMonthly);
                                if (newMonthlyAmount > otherTransactionRule[0].max_monthly_amount) {
                                    commonData.leaseStatus = 'Pending-Approval';
                                    commonData.error.push(107);
                                    commonData.landlordId = commonData.otherUser[0].id;
                                    invalidAmountBreak = parseFloat(otherTransactionRule[0].max_monthly_amount);
                                }
                            }
                            if (!parseInt(req.value.body.listconfigid)) {
                                PropertyType.countLandlordProperties(commonData.otherUser[0].id).then(landlordP => {
                                    if (landlordP.landlord_properties >= otherTransactionRule[0].max_properties) {
                                        commonData.leaseStatus = 'Pending-Approval';
                                        commonData.error.push(101);
                                        commonData.landlordId = commonData.otherUser[0].id;
                                    }
                                    callback(null);
                                }).catch(landlordE => {
                                    callback(landlordE, { responseCode: 500, message: __("internalServer") });
                                });
                            }
                            else {
                                callback(null);
                            }
                        }
                        else {
                            callback(null);
                            return false;
                        }
                        if (!currentTransactionRule.length && !otherTransactionRule.length) {
                            callback(null);
                        }
                    }).catch(error => {
                        callback(error, { responseCode: 500, message: __("internalServer") });
                    });
                }
                else if (currentRole === 2 || currentRole == "-1") {
                    /*
                    * Landlord invitation rules
                    */
                    PropertyType.countLandlordProperties(req.headers.userid).then(response => {
                        if (currentTransactionRule.length) {
                            if (!parseInt(req.value.body.listconfigid)) {
                                if (response.landlord_properties >= currentTransactionRule[0].max_properties) {
                                    commonData.leaseStatus = 'Pending-Approval';
                                    commonData.error.push(101);
                                    commonData.landlordId = req.headers.userid;
                                }
                            }

                            if (parseFloat(currentTransactionRule[0].min_transaction_amount) > parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(103);
                                commonData.landlordId = req.headers.userid;
                            }

                            if (parseFloat(currentTransactionRule[0].max_transaction_amount) < parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(105);
                                commonData.landlordId = req.headers.userid;
                            }

                            if (typeof commonData.transactionDetails[req.headers.userid] !== 'undefined') {
                                let newMonthlyAmount = parseFloat(commonData.transactionDetails[req.headers.userid].totalMonthlyAmt) + parseFloat(amountMonthly);
                                if (newMonthlyAmount > currentTransactionRule[0].max_monthly_amount) {
                                    commonData.leaseStatus = 'Pending-Approval';
                                    commonData.error.push(107);
                                    commonData.landlordId = req.headers.userid;
                                }
                            }
                        }
                        if (otherTransactionRule.length && commonData.otherUser.length) {
                            if (parseFloat(otherTransactionRule[0].min_transaction_amount) > parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(102);
                                commonData.renterId = commonData.otherUser[0].id;
                            }

                            if (parseFloat(otherTransactionRule[0].max_transaction_amount) < parseFloat(req.value.body.rent_amount)) {
                                commonData.leaseStatus = 'Pending-Approval';
                                commonData.error.push(104);
                                commonData.renterId = commonData.otherUser[0].id;
                            }

                            if (typeof commonData.transactionDetails[commonData.otherUser[0].id] !== 'undefined') {
                                let newMonthlyAmount = parseFloat(commonData.transactionDetails[commonData.otherUser[0].id].totalMonthlyAmt) + parseFloat(amountMonthly);
                                if (newMonthlyAmount > otherTransactionRule[0].max_monthly_amount) {
                                    commonData.leaseStatus = 'Pending-Approval';
                                    commonData.error.push(106);
                                    commonData.renterId = commonData.otherUser[0].id;
                                }
                            }
                            PropertyType.countRentedProperties(commonData.otherUser[0].id).then(rentalProperties => {
                                if (rentalProperties.current_leases >= otherTransactionRule[0].max_properties) {
                                    commonData.leaseStatus = 'Pending-Approval';
                                    commonData.error.push(100);
                                    commonData.renterId = commonData.otherUser[0].id;
                                }
                                callback(null);
                            }).catch(rentalError => {
                                callback(rentalError, { responseCode: 500, message: __("internalServer") });
                            });
                        } else {
                            callback(null);
                            return false;
                        }
                        if (!currentTransactionRule.length && !otherTransactionRule.length) {
                            callback(null);
                        }
                    }).catch(error => {
                        callback(error, { responseCode: 500, message: __("internalServer") });
                    });
                }
            },
            (callback) => {
                if (req.value.body.glatt == 0 || req.value.body.glong == 0) {
                    findLatLong = config.APIs.google.resource.findLatLong.replace(':address', req.value.body.addr);
                    httpHelper.requestAPI(config.APIs.google.URL, findLatLong, "GET", '').then(results => {
                        req.value.body.glatt = results.results[0].geometry.location.lat;
                        req.value.body.glong = results.results[0].geometry.location.lng;
                        callback(null);
                    }).catch(error => {
                        console.log(error);
                        logger.error(error, "Error in lat long fetch");
                        callback(null);
                    });
                } else {
                    callback(null);
                }
            },
            (callback) => {
                var userInfo = {};
                var invitedUserid = 0; var invitationid = 0;
                var userinfo1 = config.APIs.user.resource.userinfo.replace(":userId", req.headers.userid);
                var promiseEmail = httpHelper.requestAPI(config.APIs.user.URL, userinfo1, "GET", '');
                promiseEmail.then((mailuserInfo) => {
                    userInfo = mailuserInfo.response.data;
                    if (req.value.body.email == userInfo[0].email)
                        throw new cutomError(__("cannotInviteSelf"), 409)

                    requestData = { "email": req.value.body.email };
                    return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.inviteuser, "POST", requestData);
                }).then((newUserInfo) => {
                    invitedUserid = newUserInfo.response.data[0];
                    return PropertyType.addRentalproperty(req.value.body.email, invitedUserid.newuserid, req.headers.userid, req.value.params.role, req.value.body, commonData.leaseStatus)
                }).then((propertyAddress) => {
                    if (parseInt(req.value.params.role) === 1 && typeof propertyAddress[0].propertyId !== 'undefined' && propertyAddress[0].propertyId !== 0 && parseInt(propertyAddress[0].propertyId) > 0) {
                        PropertyType.updatePropertyDocuments(propertyAddress[0].propertyId, 1, req.value.body.listing_doc_type, req.value.body.listing_doc_files.join(','));
                        let previewPropLink = config.APIs.Web.URL + config.APIs.Web.resource.viewPropPage.replace(':id', propertyAddress[0].propertyId);
                        let propDocumentMailData = {
                            template: "propDocumentUpload",
                            placeholder: {
                                propertyaddress: req.value.body.addr,
                                PROPVIEWLINK: previewPropLink
                            },
                            to: config.param.supportEmail,
                            subject: __("propertyDocumentUploaded"),
                        };
                        httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", propDocumentMailData).then(propDocEmailResp => {
                            console.log("Prop document uploaded....", propDocEmailResp);
                        }).catch(propDocEmailErrResp => {
                            console.log("propDocEmailErrResp", propDocEmailErrResp);
                        });
                    }
                    ////xxxxxxxxxxxxx
                    return propertyAddress;
                }).then((propertyAddress) => {
                    if (propertyAddress[0].action != undefined) {
                        if (propertyAddress[0].action == 'alreadyLeaseRunning')
                            throw new cutomError(__("leaseAlreadyRunning"), 409)
                        else if (propertyAddress[0].action == 'listingAddressError')
                            throw new cutomError(__("addressExist"), 409);
                    }
                    invitationid = propertyAddress[0].invitaionid;
                    let signinLink = config.APIs.Web.URL + config.APIs.Web.resource.signin;
                    if (req.value.params.role == 2) {
                        var templateName = "inviteLandlord";
                        var inviteAs = " as lister";
                        signinLink = config.APIs.Web.URL + config.APIs.Web.resource.myproperties;
                    }
                    else {
                        var templateName = "inviteRenter";
                        var inviteAs = " as renter";
                        signinLink = config.APIs.Web.URL + config.APIs.Web.resource.myrentals;
                    }
                    let leaseId = 0;
                    let newTenureId = 0;
                    if (typeof propertyAddress[0].leaseIdOut !== 'undefined' && propertyAddress[0].leaseIdOut !== 0) {
                        leaseId = propertyAddress[0].leaseIdOut;
                        signinLink = signinLink + '/' + propertyAddress[0].leaseIdOut;

                        httpHelper.requestAPI(config.APIs.Listing.URL, config.APIs.Listing.resource.addAgreementPaymentTenure, 'POST', { "rent_frequency": req.value.body.paymentfreq, "leaseid": leaseId, "start_date": req.value.body.lease_startdate,"end_date": req.value.body.lease_enddate}, { "Accept-Language": getLocale() })
                            .then((response) => {
                                // if (response.response.data.length && parseInt(response.response.data[0].id) > 0) {
                                //     newTenureId = response.response.data[0].id;
                                //     newTenureId = newTenureId.toString();
                                // }
                                console.log("new Tenure added response", JSON.stringify(response));
                            }).catch(error => {
                                console.log('Add tenure error : ', error);
                            });
                        
                       /* httpHelper.requestAPI(config.APIs.Listing.URL, config.APIs.Listing.resource.tenureInfo, 'POST', { "tenure": null, "leaseid": leaseId, "payment_date": moment().utc().format('YYYY-MM-DD') }, { "Accept-Language": getLocale() })
                            .then((response) => {
                                if (response.response.data.length && parseInt(response.response.data[0].id) > 0) {
                                    newTenureId = response.response.data[0].id;
                                    newTenureId = newTenureId.toString();
                                }
                                console.log("new Tenure added response", JSON.stringify(response));
                            }).catch(error => {
                                console.log('Add tenure error : ', error);
                            });*/
                    }
                    let propertyId = 0;
                    if (typeof propertyAddress[0].propertyId !== 'undefined' && propertyAddress[0].propertyId !== 0) {
                        propertyId = propertyAddress[0].propertyId;
                    }

                    if (commonData.error.length) {
                        /* 
                        * Notify User for risk violations 
                        */
                        PropertyType.addRiskViolations(leaseId, commonData).then(vResponse => {

                        }).catch(vError => {

                        });
                        let riskViolationMessages = [];
                        _.each(commonData.error, function (code) {
                            if (typeof commonData.violationMessages[code] !== 'undefined') {
                                riskViolationMessages.push({ message: commonData.violationMessages[code] });
                            }
                        });
                        let riskMailData = {
                            template: "riskviolation",
                            placeholder: {
                                propertyaddress: req.value.body.addr,
                                riskViolationMessages: riskViolationMessages
                            },
                            to: req.value.body.email,
                            subject: __("invitationReceivedApproval")
                        };
                        let riskMailDataInvitee = {
                            template: "riskviolationInvitee",
                            placeholder: {
                                fullname: userInfo[0].fullname,
                                propertyaddress: req.value.body.addr,
                                riskViolationMessages: riskViolationMessages
                            },
                            to: userInfo[0].email,
                            subject: __("invitationReceivedApproval")
                        };
                        let riskMailSupportData = {
                            template: "riskviolationSupport",
                            placeholder: {
                                userData: userInfo[0],
                                propertyaddress: req.value.body.addr,
                                riskViolationMessages: riskViolationMessages
                            },
                            to: config.param.supportEmail,
                            subject: __("propertyLimitViolation")
                        };

                        httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", riskMailData).then(riskMail => {
                            console.log(riskMail);
                        }).catch(riskMailError => {
                            console.log("riskMailError", riskMailError);
                        });
                        httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", riskMailDataInvitee).then(riskMail => {
                            console.log(riskMail);
                        }).catch(riskMailError => {
                            console.log(riskMailError);
                        });
                        httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", riskMailSupportData).then(riskMailS => {
                            console.log(riskMailS);
                        }).catch(riskMailSError => {
                            console.log(riskMailSError);
                        });
                    }


                    let signupLink = config.APIs.Web.URL + config.APIs.Web.resource.signup.replace(":random", invitedUserid.verifytoken);
                    var mailData = { "template": templateName, "placeholder": { "fullname": userInfo[0].fullname, "propertyaddress": req.value.body.addr, "signupLink": signupLink, "signinLink": signinLink }, "to": req.value.body.email, "subject": __("invitationReceived") }
                    var headersLang = { "Accept-Language": getLocale() };
                    var notificationArr = [];
                    notificationArr.push(httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", mailData, headersLang))

                    invitationReceivedDesc = __("invitationReceivedDesc").replace("{address}", req.value.body.addr) + inviteAs;
                    var invitationData = { "invitationid": invitationid, leaseId: leaseId, role: req.value.params.role };
                    notificationData = { "title": __("invitationReceived"), "description": invitationReceivedDesc, "data": invitationData, "type": "leaseInvitation" };
                    addNotification = config.APIs.notification.resource.addNotification.replace(":userId", invitedUserid.newuserid);
                    notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, addNotification, "POST", notificationData));

                    Promise.all(notificationArr).then((data) => {
                    }).catch((err2) => {
                        console.log("notificationArr err2", err2);
                        logger.error(err2);
                    });

                    let resMessage = __("rentalAdded");
                    let responseCode = 200;
                    if (commonData.error.length) {
                        resMessage = __("rentalAddedApproval");
                    }
                    if (req.value.body.listconfigid != undefined && req.value.body.listconfigid > 0) {
                        resMessage = __("invitationSentAddRental");
                        if (commonData.error.length) {
                            resMessage = __("invitationSentAddRentalApproval");
                        }
                    }

                    if (parseInt(req.value.params.role) === 2) {
                        if (commonData.leaseStatus == 'Pending-Approval') {
                            callback(null, { responseCode: 409, response: { "details": [{ "message": __("rentalAddedAdminApproval") }], "response": { "data": { "leaseId": leaseId, "action": "admin_approval" } } } });
                        }
                        else {
                            callback(null, resMessage);
                        }
                    }
                    else {
                        if(commonData.selfUserInfo.isbankAccountVerified == 1){
                             ReplyData = { leaseId: leaseId }
                        }else{
                             ReplyData = { leaseId: leaseId, action: "addbank" }
                             resMessage = __("invitationAddBank");
                             
                        }
                        callback(null, { responseCode: responseCode, response: { data: ReplyData, details: [{ message: resMessage }] } });
                    }
                }).catch((err) => {
                    if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404)) {
                        callback(err, { responseCode: err.type, message: err.message });
                    }
                    else {
                        callback(err, { responseCode: 500, message: __("internalServer") });
                    }
                });
            }
        ], function (err, data) {
            if (err) {
                logger.error(err);
                var code = 500;
                if (typeof data.responseCode !== 'undefined') {
                    code = data.responseCode;
                    data = data.message;
                }
                else if (typeof err.statusCode !== 'undefined') {
                    code = err.statusCode;
                }
                return res.status(code).json({ details: [{ message: data }] });
            }
            let successCode = 200;
            let successResponse = data.response;
            if (data.statusCode != undefined) {
                successCode = data.statusCode;
            }
            else if (data.responseCode !== undefined) {
                successCode = data.responseCode;
            }
            if (typeof data === 'string') {
                successResponse = { details: [{ message: data }] };
            }
            res.status(successCode).json(successResponse);
        });
    },


    invitationResponse: async (req, res, next) => {
        logger.info("invitationResponse : ", req.value.body);
        var headersLang = { "Accept-Language": getLocale() };
        var resultAction = '';
        async.waterfall([
            (callback) => {
                let leaseid = 0;
                PropertyType.getLeaseInvitationRoleData(req.value.body.invitationid, (error, results) => {
                    if (!error) {
                        let roleData = results[0];
                        if (typeof roleData.data !== 'object') {
                            roleData.data = JSON.parse(roleData.data);
                        }
                        let rolesArr = _.filter(roleData.data, obj => {
                            return (parseInt(obj.role) === 2 && parseInt(obj.id) === parseInt(req.headers.userid));
                        });
                        if (rolesArr.length) {
                            if (req.value.body.action === 'Accepted') {
                                leaseid = roleData.leaseid;
                            }
                        }
                        callback(null, leaseid);
                    } else {
                        res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                        callback(error);
                    }
                });
            },
            (leaseid, callback) => {
                PropertyType.invitationResponse(req.headers.userid, req.value.body).then((result) => {
                    resultAction = result[0];
                    if (resultAction.action == 'Accepted') {
                        return PropertyType.updatePropCount(resultAction.landlordID);
                    }
                }).then(() => {
                    if (resultAction.action != 'invitationNotExist') {
                        var userinfo1 = config.APIs.user.resource.userinfo.replace(":userId", resultAction.invitedby);
                        return httpHelper.requestAPI(config.APIs.user.URL, userinfo1, "GET", '', headersLang);
                    }
                }).then((userInfo) => {
                    if (resultAction.action == 'pendingApproval') {
                        callback(null);
                        return res.status(409).json({ "details": [{ "message": __("invitationApprovalPending") }] });
                    }
                    if (resultAction.action == 'invitationNotExist') {
                        callback(null);
                        return res.status(409).json({ "details": [{ "message": __("invitationNotExist") }] });
                    } else if (resultAction.action == 'Accepted') {
                        res.json({ "details": [{ "message": __("invitationAccepted") }] });
                    } else if (resultAction.action == 'alreadyRejected') {
                        callback(null);
                        return res.json({ "details": [{ "message": __("alreadyRejectedInvitation") }] });
                    } else if (resultAction.action == 'alreadyAccepted') {
                        callback(null);
                        return res.status(409).json({ "details": [{ "message": __("alreadyAcceptedInvitation") }] });
                    } else {
                        res.json({ "details": [{ "message": __("invitationRejected") }] });
                    }

                    userInfo = userInfo.response.data;
                    if (resultAction.action == 'Accepted' || resultAction.action == 'Rejected') {
                        var mailData = { "template": "leaseInvitationResponse", "placeholder": { "fullname": userInfo[0].fullname, "propertyaddress": resultAction.address, "action": resultAction.action }, "to": userInfo[0].email, "subject": __("invitationResponse"), "userId": userInfo[0].id }

                        var notificationArr = [];
                        notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, config.APIs.notification.resource.sendmail, "POST", mailData, headersLang));

                        let msg1 = __("invitationResponseDesc");
                        invitationResponseDesc = msg1.replace("{address}", resultAction.address)

                        notificationData = { "title": __("invitationResponse"), "description": invitationResponseDesc }
                        addNotification = config.APIs.notification.resource.addNotification.replace(":userId", resultAction.invitedby);

                        notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, addNotification, "POST", notificationData, headersLang));

                        notificationData = { "id": req.value.body.notificationid }
                        removeNotification = config.APIs.notification.resource.removeNotification.replace(":userId", req.headers.userid);

                        notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, removeNotification, "PUT", notificationData, headersLang));

                        Promise.all(notificationArr).then((data) => {
                        }).catch((err2) => {
                            console.log(err2)
                            logger.error(err2);
                        });
                    }
                    callback(null);
                }).catch((err) => {
                    logger.error(err);
                    console.log(err);
                    callback(null);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                });
            }
        ], function (err, data) {
            console.log("completed");
        });
    },

    updateListingData: async (req, res, next) => {
        logger.info("updateListingData : ", req.value.body);
        console.log("updateListingData : ", req.value.body);
        async.waterfall([
            (callback) => {

                if(typeof req.value.body.actionKey != 'undefined' && req.value.body.actionKey != 'photos' && (req.value.body.actionValue == 'undefined' || req.value.body.actionValue == '')){
                    return res.status(404).json({ "details": [{ "message": __("emptyValue") }] });
                }

                PropertyType.getPropertyInternal(req.value.body.listingId).then(propertyDetails => {                    
                    if (!propertyDetails.length) {
                        return res.status(404).json({ "details": [{ "message": __("noPropertyFound") }] });
                    }
                    else{
                        callback(null, propertyDetails);
                    }
                })
                .catch(error => {
                   return res.status(404).json({ "details": [{ "message": __("noPropertyFound") }] });
                });
            },
            (propertyDetails, callback) => {
                propertyManagerModel.isPropertyAssigned(req.headers.userid, [req.value.body.listingId], (error, results) => {
                    if (!error) {
                        if (results.length || propertyDetails[0].userid == req.headers.userid) {
                            callback(null);
                        } else {
                            return res.status(409).json({ "details": [{ "message": __("unauthProp") }] });
                        }
                    } else {
                        callback(error, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
                    }
                });
            },
            (callback) => {
                PropertyType.updatePropertyData(req.value.body, (error, results) => {
                    if (!error) {                        
                        return res.status(200).json({ "details": [{ "message": __("listingDataUpdated") }] });
                    } else {
                        return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                        callback(error);
                    }
                });
            }
        ], function (err, data) {
            if(err){
                console.log("Update Listing Error : ", err);
            }
            else{
                console.log("Update Listing Completed : ", data);
            }
        });
    },

    inviteByRenter: async (req, res, next) => {
        logger.info("inviteByRenter :", req.value, req.headers.userid);

        if (req.value.params.role == 2)
            return res.status(409).json({ "details": [{ "message": __("unauthLandlordInvite") }] });

        var headersLang = { "Accept-Language": getLocale() };
        var userInfo = {};
        var leaseInfo = {};
        var landlordinfo = {};
        var promiseArr = [];

        var userinfo1 = config.APIs.user.resource.userinfo.replace(":userId", req.headers.userid)
        promiseArr.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo1, "GET", '', headersLang))
        promiseArr.push(PropertyAction.leaseDetail(req.value.body.leaseid))
        Promise.all(promiseArr).then((userLeaseData) => {

            if (userLeaseData[1].length == 0 || userLeaseData[1][0].leaseid == null) {
                throw new cutomError(__("noLease"), 409);
            } else if (userLeaseData[1].length >= 0) {
                let userrole = JSON.parse(userLeaseData[1][0].userrole);
                renterinfo = find.one.in(userrole).with({ "role": '1' });
                landlordinfo = find.one.in(userrole).with({ "role": '2' });

                if (userLeaseData[1][0].propertyid != req.value.body.propertyId)
                    throw new cutomError(__("PropertyNotExist"), 404);
                else if (renterinfo.userid != req.headers.userid)
                    throw new cutomError(__("unauthrizedInvite"), 409);
            }
            userInfo = userLeaseData[0].response.data;
            leaseInfo = userLeaseData[1];

            /**Check if lease is either Expired, Cancelled, Declined OR Moveout, then invitation cannot be sent or updated*/
            var disAllowed = ['Expired', 'Cancelled', 'Declined', 'Moveout'];
            if (disAllowed.indexOf(leaseInfo[0].lease_status) !== -1) {
                var msgErr = __("cannotSendInvitationForLease");
                msgErr = msgErr.replace(":LEASESTATUS", leaseInfo[0].lease_status);
                throw new cutomError(msgErr, 409);
            }

            if (req.value.body.email == userInfo[0].email)
                throw new cutomError(__("cannotInviteSelf"), 409);

            if (req.value.body.invitation_id != undefined && req.value.body.invitation_id > 0) {

                return PropertyType.invitedUserId(req.value.body.invitation_id)
                    .then((invitedinfo) => {
                        if (invitedinfo[0].status == 'Accepted')
                            throw new cutomError(__("invitationAlreadyAccepted"), 409)

                        var userinfo2 = config.APIs.user.resource.userinfo.replace(":userId", invitedinfo[0].userid)
                        return httpHelper.requestAPI(config.APIs.user.URL, userinfo2, "GET", '', headersLang)
                    }).then((userinfo2) => {
                        userinvited = userinfo2.response.data[0];

                        if (userinvited.mobile != null) {
                            /**User has already signed up.*/
                            selfPropType.sendInvitation(res, req.value.body.email, req.headers.userid, req.value.params.role, req.value.body, userInfo, leaseInfo, landlordinfo, req.value.body.invitation_id);

                        } else {
                            /**User has not signup yet. so edit existing email*/
                            selfPropType.updateInvitationByRenter(res, userinvited, req.value.body, req.headers.userid, leaseInfo, req.value.params.role, userInfo);
                        }
                    }).catch((err) => {
                        if (err.type != undefined && (err.type == 400 || err.type == 403 || err.type == 409 || err.type == 404))
                            return res.status(err.type).json({ "details": [{ "message": err.message }] });
                        else if (err.message.details != undefined) {
                            return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
                        } else {
                            logger.error(err);
                            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                        }
                    })
            } else {
                /**Send new invitation*/
                selfPropType.sendInvitation(res, req.value.body.email, req.headers.userid, req.value.params.role, req.value.body, userInfo, leaseInfo, landlordinfo);
            }
        }).catch((err) => {
            console.log("err is here:", err);
            if (err.type != undefined && (err.type == 400 || err.type == 403 || err.type == 409 || err.type == 404))
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        })
    },

    sendInvitation: (res, email, loggedUserId, role, body, userInfo, leaseInfo, landlordinfo, invitation_id) => {
        //invitation_id will be only in case of update
        var headersLang = { "Accept-Language": getLocale() };
        var cmn = {};
        requestData = { "email": email }
        return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.inviteuser, "POST", requestData, headersLang)
            .then((newUserInfo) => {
                invitedUserid = newUserInfo.response.data[0];
                if (invitedUserid.newuserid == landlordinfo.userid)
                    throw new cutomError(__("cannotInvitelandlord"), 409);

                invitedbyRole = 1; //Renter
                if (invitation_id) {
                    return PropertyType.updateInvitationLog(invitation_id, body.email, invitedUserid.newuserid)
                } else {
                    return PropertyType.addPropertyRole(invitedUserid.newuserid, loggedUserId, role, invitedbyRole, body)
                }
            }).then((invitationData) => {
                if (invitationData[0].action != undefined && invitationData[0].action == 'userRoleExists') {
                    let msg = __("userExistsOnLease");
                    if (invitationData[0].roleId == 1)
                        msg = __("userExistsOnLeaseAsRenter");
                    else if (invitationData[0].roleId == 2)
                        msg = __("userExistsOnLeaseAsLord");
                    else if (invitationData[0].roleId == 3)
                        msg = __("userExistsOnLeaseAsSponsor");
                    else if (invitationData[0].roleId == 4)
                        msg = __("userExistsOnLeaseAsFlatmate");
                    throw new cutomError(msg, 409);
                }
                cmn.invtid = invitationData[0].invitaionid;

                if (invitation_id)
                    cmn.invtid = invitation_id;

                let msg = __("invitationSent")
                if (invitation_id)
                    msg = __("invitationSentEmailUpdated");

                res.json({ "details": [{ "message": msg }] });

                /**Remove notification for old user*/
                mapData = { "mapData": { "invitationid": cmn.invtid, "type": ["renterInvitation", "leaseInvitation"] } }
                let removeNotificationbycond = config.APIs.notification.resource.removeNotificationbycond;
                return httpHelper.requestAPI(config.APIs.notification.URL, removeNotificationbycond, "PUT", mapData, headersLang)
            }).then(() => {
                /**Now send emails */
                console.log(role, invitedUserid, leaseInfo, body, cmn.invtid, userInfo[0])
                selfPropType.sendInvitationEmails(role, invitedUserid, leaseInfo, body, cmn.invtid, userInfo[0]);
            }).catch((err3) => {
                console.log("err3err3", err3)
                if (err3.type != undefined && (err3.type == 400 || err3.type == 403 || err3.type == 409 || err3.type == 404))
                    return res.status(err3.type).json({ "details": [{ "message": err3.message }] });
                else {
                    logger.error(err3);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })
    },
    updateInvitationByRenter: (res, userinvited, body, userid, leaseInfo, role, loggedUserInfo) => {
        var headersLang = { "Accept-Language": getLocale() };
        var invitedUserDetails = {};
        var comn = {};
        var rolesArr = JSON.parse(leaseInfo[0].userrole);
        invitedUserDetails.newuserid = userinvited.id;
        invitedUserDetails.verifytoken = userinvited.emailVerifytoken;
        return PropertyType.updateInvitation(body, userid, userinvited.id)
            .then((invitationId) => {
                leaseInfo.invitationId = invitationId;

                /**Now update in user table*/
                var bdy = { "userId": invitedUserDetails.newuserid, "email": body.email };
                return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.updatemail, "PUT", bdy, headersLang)
            }).then((updateEmailResp) => {
                var promises = [];
                if (updateEmailResp.details[0].action != undefined && updateEmailResp.details[0].action == 'exists') {
                    invitedUserDetails.newuserid = updateEmailResp.details[0].id;
                    var invitationData = _.filter(rolesArr, function (obj) {
                        return parseInt(obj.userid) === parseInt(invitedUserDetails.newuserid);
                    });
                    if (invitationData.length) {
                        let msg = __("userExistsOnLease");
                        if (invitationData[0].role == 1) {
                            msg = __("userExistsOnLeaseAsRenter");
                        } else if (invitationData[0].role == 2) {
                            msg = __("userExistsOnLeaseAsLord");
                        } else if (invitationData[0].role == 3) {
                            msg = __("userExistsOnLeaseAsSponsor");
                        } else if (invitationData[0].role == 4) {
                            msg = __("userExistsOnLeaseAsFlatmate");
                        }
                        throw new cutomError(msg, 409);
                    }
                    promises.push(PropertyType.updateInvitedUserId(body.invitation_id, updateEmailResp.details[0].id, role, body.leaseid))

                    /**Get info of this user*/
                    userinfo = config.APIs.user.resource.userinfo.replace(":userId", updateEmailResp.details[0].id);
                    promises.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang))
                    test = Promise.all(promises).then((information) => {
                        userinvited = information[1].response.data[0];
                        invitedUserDetails.verifytoken = userinvited.emailVerifytoken;
                    });
                    return test;
                }
            }).then(() => {
                res.json({ "details": [{ "message": __("invitationSentEmailUpdated") }] });

                /**Remove notification for old user*/
                mapData = { "mapData": { "invitationid": leaseInfo.invitationId, "type": ["renterInvitation", "leaseInvitation"] } }
                let removeNotificationbycond = config.APIs.notification.resource.removeNotificationbycond;
                return httpHelper.requestAPI(config.APIs.notification.URL, removeNotificationbycond, "PUT", mapData, headersLang)
            }).then(() => {

                /**Now send emails */
                selfPropType.sendInvitationEmails(role, invitedUserDetails, leaseInfo, body, leaseInfo.invitationId, loggedUserInfo[0])
            }).catch((err) => {
                console.log("errerr", err)
                if (err.type != undefined && (err.type == 400 || err.type == 403 || err.type == 409 || err.type == 404))
                    return res.status(err.type).json({ "details": [{ "message": err.message }] });
                else if (err.message.details != undefined) {
                    return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
                } else {
                    logger.error(err);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })
    },
    sendInvitationEmails: (roleId, invitedUserid, leaseInfo, body, invitationid, invitingUserInfo) => {
        var notificationArr = [];
        var headersLang = { "Accept-Language": getLocale() };

        if (roleId == 3) {
            var templateName = "inviteSponsor";
            var invitedAs = " as sponsor";
        } else {
            var templateName = "inviteFlatmate";
            var invitedAs = " as flatmate";
        }
        let signupLink = config.APIs.Web.URL + config.APIs.Web.resource.signup.replace(":random", invitedUserid.verifytoken);
        //        let signinLink = config.APIs.Web.URL + config.APIs.Web.resource.signin;
        let signinLink = config.APIs.Web.URL + config.APIs.Web.resource.myrentals + '/' + leaseInfo[0].leaseid;
        let mailData = { "template": templateName, "placeholder": { "invitingUserName": invitingUserInfo.fullname, "propertyaddress": leaseInfo[0].address, "signupLink": signupLink, "signinLink": signinLink }, "to": body.email, "subject": __("invitationReceived") }

        notificationArr.push(httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", mailData, headersLang));

        let msg1 = __("invitationReceivedDesc");
        invitationReceivedDesc = msg1.replace("{address}", leaseInfo[0].address) + invitedAs;
        var invitationData = { "invitationid": invitationid }
        notificationData = { "title": __("invitationReceived"), "description": invitationReceivedDesc, "data": invitationData, "type": "renterInvitation" }

        addNotification = config.APIs.notification.resource.addNotification.replace(":userId", invitedUserid.newuserid);
        notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, addNotification, "POST", notificationData, headersLang));

        Promise.all(notificationArr).then((data) => {
            // console.log("all work done")
        }).catch((err2) => {
            //console.log("err2", err2)
            logger.error(err2);
        })
    },
    inviteResponseFlatmateSponsor: async (req, res, next) => {
        logger.info("inviteResponseFlatmateSponsor : ", req.value.body);

        var headersLang = { "Accept-Language": getLocale() };
        var resultAction = '';
        return PropertyType.inviteResponseFlatmateSponsor(req.headers.userid, req.value.body)
            .then((result) => {
                resultAction = result[0];
                if (resultAction.action != 'invitationNotExist') {
                    var userinfo1 = config.APIs.user.resource.userinfo.replace(":userId", result[0].invitedby);
                    return httpHelper.requestAPI(config.APIs.user.URL, userinfo1, "GET", '', headersLang);
                }
            }).then((userInfo) => {
                console.log('resultAction.action ', resultAction.action)
                if (resultAction.action == 'invitationNotExist')
                    return res.status(404).json({ "details": [{ "message": __("invitationNotExist") }] });
                else if (resultAction.action == 'Accepted')
                    res.json({ "details": [{ "message": __("invitationAccepted") }] });
                else if (resultAction.action == 'alreadyRejected')
                    return res.json({ "details": [{ "message": __("alreadyRejectedInvitation") }] });
                else if (resultAction.action == 'alreadyAccepted')
                    return res.status(409).json({ "details": [{ "message": __("alreadyAcceptedInvitation") }] });
                else
                    res.json({ "details": [{ "message": __("invitationRejected") }] });

                userInfo = userInfo.response.data;
                console.log('resultAction.action ', resultAction.action)
                if (resultAction.action == 'Accepted' || resultAction.action == 'Rejected') {
                    var mailData = { "template": "leaseInvitationResponse", "placeholder": { "fullname": userInfo[0].fullname, "propertyaddress": resultAction.address, "action": resultAction.action }, "to": userInfo[0].email, "subject": __("invitationResponse"), "userId": userInfo[0].id }

                    var notificationArr = [];
                    notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, config.APIs.notification.resource.sendmail, "POST", mailData, headersLang));

                    let msg1 = __("invitationResponseDesc");
                    invitationResponseDesc = msg1.replace("{address}", resultAction.address);

                    notificationData = { "title": __("invitationResponse"), "description": invitationResponseDesc }
                    addNotification = config.APIs.notification.resource.addNotification.replace(":userId", resultAction.invitedby);

                    notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, addNotification, "POST", notificationData, headersLang));
                    notificationData = { "id": req.value.body.notificationid }
                    removeNotification = config.APIs.notification.resource.removeNotification.replace(":userId", req.headers.userid);

                    notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, removeNotification, "PUT", notificationData, headersLang))

                    Promise.all(notificationArr).then((data) => {
                        console.log('data ', data)
                    }).catch((err2) => {
                        logger.error(err2);
                    });
                }
            }).catch((err) => {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            });
    },
    renewexpirelisting: async (req, res, next) => {
        logger.info("renewexpirelisting : ");

        var headersLang = { "Accept-Language": getLocale() };
        var resultAction = '';
        var promise = PropertyType.renewexpirelisting();
        var cronstatus = {};
        promise.then((result) => {
            if (result[0].liststatus != '') {
                result[0].liststatus = JSON.parse(result[0].liststatus);
            }
            let propertyidstr = "-1";
            result[0].liststatus.forEach((element) => {
                propertyidstr += "," + element.id;
            });
            cronstatus = result[0].liststatus;

            return PropertyType.propertybyids(propertyidstr);
        }).then((PropertyData) => {

            let userarr = [];
            PropertyData.forEach((element) => {
                userarr.push(element.userid)
            });
            let unique = [...new Set(userarr)];
            var userInfoArr = [];
            unique.forEach((element) => {
                let userinfo = config.APIs.user.resource.userinfoInternal.replace(":userId", element);
                userInfoArr.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang));
            });
            Promise.all(userInfoArr).then((userInfoData) => {
                var mailArr = [];
                PropertyData.forEach((element) => {
                    userdata1 = find.one.in(userInfoData).having('response.data').with({ "id": element.userid });
                    publishstatus = find.one.in(cronstatus).with({ "id": element.propertyid })

                    if (publishstatus.status == "republished") {
                        template = "propertyRePublished";
                        subject = __("listingRepublishSubject");
                    } 					
					else {
                        template = "propertyExpired";
                        subject = __("listingExpireSubject");						
                    }
					/*
					var data = { "template": template, "placeholder": { "fullname": userdata1.response.data[0].fullname, "propertyaddress": element.address }, "to": userdata1.response.data[0].email, "subject": subject, "userId": userdata1.response.data[0].id }
					return httpHelper.requestAPI(config.APIs.notification.URL, config.APIs.notification.resource.sendmail, "POST", data, headersLang);
					*/
                });
                let cronexecution = config.APIs.Common.resource.cronexecution;
                httpHelper.requestAPI(config.APIs.Common.URL, cronexecution, "POST", { "cronName": "renewexpirelisting", "description": "This cron used to renew and expire publish listings." }, headersLang);
                return res.status(200).json({ "response": { "data": cronstatus } })
            }).catch((err2) => {
                logger.error(err2);
            })
        }).catch((err) => {
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });
    },
    topRenters: async (req, res, next) => {
        logger.info("topRenters : ");

        var headersLang = { "Accept-Language": getLocale() };
        var promise = PropertyType.topRenters(req.headers.userid);
        promise.then((usersIds) => {
            if (usersIds.length == 0)
                throw new cutomError(__("noTopRenterFound"), 409);

            let ratings = [];
            let userInfoArr = [];
            let unique = [...new Set(JSON.parse(usersIds[0][0].userIdstr))];

            if (usersIds.length == 2) {
                ratings = usersIds[1];
            }

            unique.forEach((element) => {
                if (element > 0) {
                    let userinfo = config.APIs.user.resource.userinfoInternal.replace(":userId", element);
                    userInfoArr.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang));
                }
            });
            userArr = [];
            Promise.all(userInfoArr).then((userInfoData) => {
                userInfoData.forEach((element) => {
                    if (element.response.data[0].profileimage == null || element.response.data[0].profileimage == '')
                        element.response.data[0].profileimage = config.param.defaulProfileImage;
                    ratingInfo = find.one.in(ratings).with({ "renterid": element.response.data[0].id })
                    if (ratingInfo != undefined) {
                        element.response.data[0].avgrating = ratingInfo.avgrating;
                        element.response.data[0].total = ratingInfo.total;
                    } else {
                        element.response.data[0].avgrating = 0;
                        element.response.data[0].total = 0;
                    }

                    userArr.push(element.response.data[0])
                })
                return res.status(200).json({ "response": { "data": userArr } })
            }).catch((err) => {
                console.log(err)
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            })
        }).catch((err) => {
            console.log(err)
            if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404)) {
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            } else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        });
    },
    topRentersMobile: (req, res, next) => {
        logger.info("topRentersMobile : ", req.headers);
        var headersLang = { "Accept-Language": getLocale() };
        async.waterfall([
            function (callback) {
                callback(null, req.headers.userid);
            },
            function (userid, callback) {
                var promise = PropertyType.topRenters(userid);
                promise.then((usersIds) => {
                    if (usersIds.length == 0)
                        throw new cutomError(__("noTopRenterFound"), 409);
                    let ratings = [];
                    let userInfoArr = [];
                    let unique = [...new Set(JSON.parse(usersIds[0][0].userIdstr))];

                    if (usersIds.length == 2) {
                        ratings = usersIds[1];
                    }

                    unique.forEach((element) => {
                        if (element > 0) {
                            let userinfo = config.APIs.user.resource.userinfoInternal.replace(":userId", element);
                            userInfoArr.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang));
                        }
                    });
                    userArr = [];
                    Promise.all(userInfoArr).then((userInfoData) => {
                        userInfoData.forEach((element) => {
                            if (element.response.data[0].profileimage == null || element.response.data[0].profileimage == '')
                                element.response.data[0].profileimage = config.param.defaulProfileImage;
                            ratingInfo = find.one.in(ratings).with({ "renterid": element.response.data[0].id })
                            if (ratingInfo != undefined) {
                                element.response.data[0].avgrating = ratingInfo.avgrating.toString();
                                element.response.data[0].total = ratingInfo.total;
                            } else {
                                element.response.data[0].avgrating = "0".toString();
                                element.response.data[0].total = 0;
                            }

                            userArr.push(element.response.data[0])
                        });
                        callback(null, userArr, userid);
                    }).catch((err) => {
                        logger.error(err);
                        callback(err, __("internalServer"));
                    });
                }).catch((err) => {
                    if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404)) {
                        callback(err, { responseCode: err.type, message: err.message });
                    } else {
                        logger.error(err);
                        callback(err, __("internalServer"));
                    }
                });
            },
            function (userArr, userid, callback) {
                let propertyData = {
                    userId: userid,
                    statusType: 'P'
                };
                PropertyType.getPropertyList(propertyData).then((response => {
                    let properties = _.filter(response, function (obj) {
                        return (obj.address).trim() !== '';
                    });
                    callback(null, { topRenters: userArr, properties: properties });
                })).catch((error) => {
                    callback(error, __("internalServer"));
                });
            }
        ], function (err, data) {
            if (err) {
                logger.error(err);
                var code = 500;
                if (typeof data.responseCode !== 'undefined') {
                    code = data.responseCode;
                    data = data.message;
                }
                return res.status(code).json({ "details": [{ "message": data }] });
            }
            res.status(200).json({ "response": { "data": data } });
        });
    },

    allProperties: async (req, res, next) => {
        logger.info("allProperties : ");

        var headersLang = { "Accept-Language": getLocale() };
        var comnVals = {};
        comnVals.properties = [];
        return PropertyType.allProperties(req.headers.userid, req.value.params.role)
            .then((properties) => {

                if (properties.length != 0) {

                    var userInfoArr = [];
                    var userIds = [];
                    properties.forEach((property) => {
                        if (property.landlord_id != undefined) {
                            userIds.push(property.landlord_id);
                        }
                    })
                    let unique = [...new Set(userIds)];

                    unique.forEach((uniqueId) => {
                        if (uniqueId > 0) {
                            let userinfo = config.APIs.user.resource.userinfo.replace(":userId", uniqueId);
                            userInfoArr.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang));
                        }
                    });
                    test = Promise.all(userInfoArr).then((userInfoLandlord) => {
                        properties.forEach((property) => {
                            property.landlord_email = "";
                            if (property.landlord_id) {
                                info = find.one.in(userInfoLandlord).having('response.data').with({ "id": property.landlord_id })
                                property.landlord_email = info != undefined ? info.response.data[0].email : "";
                            }
                        })
                    });
                    comnVals.properties = properties;
                    return test;
                }
            }).then(() => {
                return res.json({ "response": { "data": comnVals.properties } });
            }).catch((err) => {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            });
    },
    inviteTopRenterForProperty: (req, res, next) => {
        logger.info("inviteRenter : ", req.params, req.value.body);
        var headersLang = { "Accept-Language": getLocale() };
        async.waterfall([
            (callback) => {
                PropertyType.getPropertyInternal(req.value.body.property_id).then(propertyDetails => {
                    if (!propertyDetails.length) {
                        callback({ error: __("noPropertyFound") }, { responseCode: 404, response: { "details": [{ "message": __("noPropertyFound") }] } });
                        return false;
                    }
                    if ((req.headers.userid != undefined && propertyDetails[0].userid != req.headers.userid) && (req.value.body.email === 'undefined' || !req.value.body.email)) {
                        callback({ error: __("unauthInvitation") }, { responseCode: 409, response: { "details": [{ "message": __("unauthInvitation") }] } });
                        return false;
                    }
                    callback(null, propertyDetails);
                }).catch(error => {
                    callback(error, { responseCode: 500, response: { "details": [{ "message": __("internalServer") }] } });
                });
            },
            (propertyDetails, callback) => {
                /* Sender Details*/
                httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.userinfoInternal.replace(":userId", req.headers.userid), "GET", '', headersLang).then(senderInfo => {
                    if (senderInfo.response.data.length) {
                        callback(null, propertyDetails, senderInfo.response.data[0]);
                        return false;
                    }
                    callback({ error: 'User not found' }, { responseCode: 500, response: { "details": [{ "message": __("internalServer") }] } });
                }).catch(error => {
                    callback(error, { responseCode: 500, response: { "details": [{ "message": __("internalServer") }] } });
                });
            },
            (propertyDetails, sender, callback) => {
                if (typeof req.value.body.email !== 'undefined' && req.value.body.email.trim()) {
                    let receiver = {
                        id: null,
                        fullname: '',
                        email: req.value.body.email
                    };
                    callback(null, propertyDetails, sender, receiver);
                    return false;
                }
                httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.userinfoInternal.replace(":userId", req.value.body.renter_id), "GET", '', headersLang).then(receiverInfo => {
                    if (receiverInfo.response.data.length) {
                        callback(null, propertyDetails, sender, receiverInfo.response.data[0]);
                        return false;
                    }
                    callback({ error: 'User 2 not found' }, { responseCode: 500, response: { "details": [{ "message": __("internalServer") }] } });
                }).catch(error => {
                    callback(error, { responseCode: 500, response: { "details": [{ "message": __("internalServer") }] } });
                });
            },
            (propertyDetails, sender, receiver, callback) => {
                let mailURL = config.APIs.user.URL;
                let mailRes = config.APIs.user.resource.sendmail;
                let previewLink = config.APIs.Web.URL + config.APIs.Web.resource.viewPropPage.replace(':id', req.value.body.property_id);
                let data = {
                    template: "inviteTopRenterForProperty",
                    placeholder: {
                        fullname: receiver.fullname,
                        sender_fullname: sender.fullname,
                        property_address: propertyDetails[0].address,
                        PROPVIEWLINK: previewLink
                    },
                    to: receiver.email,
                    subject: __("inviteFromLandlordSubject")
                };
                if (receiver.id) {
                    data.userId = receiver.id;
                    mailURL = config.APIs.notification.URL;
                    mailRes = config.APIs.notification.resource.sendmail;
                }
                PropertyType.inviteTopRenterForProperty([req.headers.userid, receiver.id, req.value.body.property_id, receiver.email]).then(saveRes => {
                    console.log("saveRes: ", saveRes);
                }).catch(SaveErr => {
                    console.log("SaveErr: ", SaveErr);
                });
                httpHelper.requestAPI(mailURL, mailRes, "POST", data, headersLang).then(mailRes => {
                    console.log("mailRes: ", mailRes);
                }).catch(mailErr => {
                    console.log("mailErr: ", mailErr);
                });
                callback(null, { responseCode: 200, response: { "details": [{ "message": __("invitationSent") }] } });
            }
        ], (err, data) => {
            if (err) {
                logger.error("error :", err);
            }
            res.status(data.responseCode).json(data.response);
        });

    },
    inviteTopRenterForPropertyBKP: async (req, res, next) => {
        logger.info("inviteRenter : ", req.params, req.value.body);

        var headersLang = { "Accept-Language": getLocale() };
        var promises = [];
        return PropertyType.getPropertyInternal(req.value.body.property_id)
            .then((propertyDetails) => {

                if (propertyDetails.length == 0)
                    throw new cutomError(__("noPropertyFound"), 404);

                if (propertyDetails[0].userid != req.headers.userid)
                    throw new cutomError(__("unauthInvitation"), 409);

                userinfo1 = config.APIs.user.resource.userinfoInternal.replace(":userId", req.headers.userid);
                userinfo2 = config.APIs.user.resource.userinfoInternal.replace(":userId", req.value.body.renter_id);

                promises.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo1, "GET", '', headersLang));
                promises.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo2, "GET", '', headersLang));

                promises.push(PropertyType.inviteTopRenterForProperty([req.headers.userid, req.value.body.renter_id, req.value.body.property_id]))

                Promise.all(promises).then((promisesResp) => {

                    res.json({ "details": [{ "message": __("invitationSent") }] });

                    let sender = promisesResp[0].response.data[0]
                    let receiver = promisesResp[1].response.data[0]

                    /**Send email */
                    let previewLink = config.APIs.Web.URL + config.APIs.Web.resource.viewPropPage;
                    previewLink = previewLink.replace(':id', req.value.body.property_id);
                    var data = { "template": "inviteTopRenterForProperty", "placeholder": { "fullname": receiver.fullname, "sender_fullname": sender.fullname, "property_address": propertyDetails[0].address, "PROPVIEWLINK": previewLink }, "to": receiver.email, "subject": __("inviteFromLandlordSubject"), "userId": receiver.id }

                    httpHelper.requestAPI(config.APIs.notification.URL, config.APIs.notification.resource.sendmail, "POST", data, headersLang)
                    console.log('All Done')
                }).catch(function (error1) {
                    logger.error(error1);
                });

            }).catch((err) => {
                logger.error(err);
            });
    },

    correctEmailId: async (req, res, next) => {
        logger.info("correctEmailId : ", req.params, req.value.body);

        if (req.value.params.role == 3 || req.value.params.role == 4)
            return res.status(409).json({ "details": [{ "message": __("unauthInvitation") }] });

        var headersLang = { "Accept-Language": getLocale() };
        var leaseInfo = {}
        var loggeinUser = {}
        var promiseArr = [];
        var userinfo1 = config.APIs.user.resource.userinfoInternal.replace(":userId", req.headers.userid)
        promiseArr.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo1, "GET", '', headersLang))
        promiseArr.push(PropertyAction.leaseDetail(req.value.params.leaseid))
        Promise.all(promiseArr).then((userLeaseData) => {
            loggeinUser = userLeaseData[0].response.data;
            leaseInfo = userLeaseData[1];

            if (userLeaseData[1].length == 0 || userLeaseData[1][0].leaseid == null) {
                throw new cutomError(__("noLease"), 409);
            } else if (userLeaseData[1].length >= 0) {

                /**Check if lease is either Expired, Cancelled, Declined OR Moveout, then invitation cannot be sent or updated*/
                if (userLeaseData[1][0].lease_status != "Pending" && userLeaseData[1][0].lease_status != "Pending-Approval") {
                    var msgErr = __("cannotSendInvitationForLease");

                    /**Below code added by Monika and Gurvinder. This is because its not allowing to update email id of invited user when lease is under admin approval. */
                    /*if(userLeaseData[1][0].lease_status === 'Pending-Approval') {
                        msgErr = __("cannotSendInvitationForLeaseAdmin");
                    }*/
                    msgErr = msgErr.replace(":LEASESTATUS", userLeaseData[1][0].lease_status);
                    throw new cutomError(msgErr, 409)
                }
            }
            if (req.value.body.email == loggeinUser[0].email)
                throw new cutomError(__("cannotInviteSelf"), 409)

            let userrole = JSON.parse(leaseInfo[0].userrole);
            renterinfo = find.one.in(userrole).with({ "role": '1' });
            landlordinfo = find.one.in(userrole).with({ "role": '2' });

            if (req.value.params.role == 2)
                invitedUserId = landlordinfo.userid
            else
                invitedUserId = renterinfo.userid

            var invitedUserUrl = config.APIs.user.resource.userinfo.replace(":userId", invitedUserId);
            return httpHelper.requestAPI(config.APIs.user.URL, invitedUserUrl, "GET", '', headersLang)
        }).then((InvitedUserInfo) => {
            userinvited = InvitedUserInfo.response.data[0];
            leaseInfo.userinvited = userinvited;

            return PropertyType.getInvitationid(req.value.params.leaseid, req.headers.userid, leaseInfo.userinvited.id);
        }).then((invitationId) => {
            leaseInfo.invitationData = invitationId[0];
            console.log(invitationId);
            if (invitationId[0].status == 'Accepted')
                throw new cutomError(__("invitationAlreadyAccepted"), 409)

            if (userinvited.mobile != null && userinvited.mobile != '') {
                //user has already signedup, check user exists or not and then send invitation + entry log
                console.log('User has already signed up.. sorry!!')
                selfPropType.inviteLordRenter(res, leaseInfo, req.value.body.newemail, req.value.params.role, req.value.params.leaseid);
            } else {
                //user has not signeed up yet, update email id only + entry in log
                console.log('User has not signed up yet')
                selfPropType.updateInvitationForLordRenter(res, leaseInfo, req.value.body.newemail, req.value.params.role, req.value.params.leaseid);
            }
        }).catch((err) => {
            if (err.type != undefined)
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            else if (err.message.details != undefined) {
                return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
            } else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        })
    },
    inviteLordRenter: (res, leaseInfo, newemail, role, leaseid) => {

        var headersLang = { "Accept-Language": getLocale() };
        requestData = { "email": newemail }
        return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.inviteuser, "POST", requestData, headersLang)
            .then((newUserInfo) => {
                leaseInfo.userinvited.id = newUserInfo.response.data[0].newuserid;
                invitedbyRole = role == 1 ? 2 : 1;
                return PropertyType.updateInvitationLog(leaseInfo.invitationData.id, newemail, leaseInfo.userinvited.id)
            }).then((invitationData) => {
                invitationid = leaseInfo.invitationData.id;

                let msg = __("invitationSent");
                if (invitationid)
                    msg = __("invitationSentEmailUpdated");

                res.json({ "details": [{ "message": msg }] });

                /**Remove notification for old user*/
                mapData = { "mapData": { "invitationid": leaseInfo.invitationData.id, "type": ["renterInvitation", "leaseInvitation"] } }
                let removeNotificationbycond = config.APIs.notification.resource.removeNotificationbycond;
                return httpHelper.requestAPI(config.APIs.notification.URL, removeNotificationbycond, "PUT", mapData, headersLang)
            }).then(() => {
                /**Now send emails */
                if (parseInt(role) === 2) {
                    PropertyType.updatePropLandlordId(leaseInfo[0].propertyid, leaseInfo.userinvited.id);
                } else if (parseInt(role) === 1) {
                    PropertyType.updatePropRenterId(leaseInfo[0].propertyid, leaseInfo.userinvited.id);
                }
                PropertyType.updateUserRole(leaseInfo.userinvited.id, role, leaseid);
                selfPropType.notifyForInviteLordRenter(role, leaseInfo, newemail);
            }).catch((err3) => {
                console.log("err in here is err3 ", err3)
                if (err3.type != undefined && (err3.type == 400 || err3.type == 403 || err3.type == 409 || err3.type == 404))
                    return res.status(err3.type).json({ "details": [{ "message": err3.message }] });
                else {
                    logger.error(err3);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })
    },
    updateInvitationForLordRenter: (res, leaseInfo, newemail, role, leaseid) => {

        var headersLang = { "Accept-Language": getLocale() };
        var cmnVars = {};
        var body = { "userId": leaseInfo.userinvited.id, "email": newemail };
        return httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.updatemail, "PUT", body, headersLang)
            .then((updateEmailResp) => {
                var promisesArr = [];
                cmnVars.useridis = updateEmailResp.details[0].id;

                if (updateEmailResp.details[0].action != undefined && updateEmailResp.details[0].action == 'exists') {
                    leaseInfo.userinvited.id = updateEmailResp.details[0].id;
                    leaseInfo.userinvited.emailVerifytoken = updateEmailResp.details[0].emailVerifytoken;

                    promisesArr.push(PropertyType.updateInvitedUserId(leaseInfo.invitationData.id, updateEmailResp.details[0].id, role, leaseid))

                    /**Get info of this user*/
                    userinfo = config.APIs.user.resource.userinfoInternal.replace(":userId", updateEmailResp.details[0].id);
                    promisesArr.push(httpHelper.requestAPI(config.APIs.user.URL, userinfo, "GET", '', headersLang))

                    test = Promise.all(promisesArr).then((information) => {
                        console.log(information)
                        //leaseInfo.userinvited = information[2].response.data[0];
                    });
                    return test;
                }
            }).then(() => {
                var promisesArr2 = [];
                /**Entry in invitation log */
                promisesArr2.push(PropertyType.invitationLog(leaseInfo.invitationData.id, newemail))

                if (parseInt(role) === 2) {
                    promisesArr2.push(PropertyType.updatePropLandlordId(leaseInfo[0].propertyid, cmnVars.useridis))
                } else if (parseInt(role) === 1) {
                    promisesArr2.push(PropertyType.updatePropRenterId(leaseInfo[0].propertyid, cmnVars.useridis));
                }
                /**Remove notification for old user*/
                mapData = { "mapData": { "invitationid": leaseInfo.invitationData.id, "type": ["renterInvitation", "leaseInvitation"] } }
                let removeNotificationbycond = config.APIs.notification.resource.removeNotificationbycond;
                promisesArr2.push(httpHelper.requestAPI(config.APIs.notification.URL, removeNotificationbycond, "PUT", mapData, headersLang))

                test = Promise.all(promisesArr2).then((information2) => {
                    console.log(information2)
                });
                return test;
            }).then(() => {
                res.json({ "details": [{ "message": __("invitationSentEmailUpdated") }] });
                selfPropType.notifyForInviteLordRenter(role, leaseInfo, newemail);
            }).catch((err) => {
                console.log("Err here is ", err)
                if (err.type != undefined)
                    return res.status(err.type).json({ "details": [{ "message": err.message }] });
                else if (err.message.details != undefined) {
                    return res.status(err.statusCode).json({ "details": [{ "message": err.message.details[0].message }] });
                } else {
                    logger.error("error :", err);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })
    },
    notifyForInviteLordRenter: (role, leaseInfo, newemail) => {

        var headersLang = { "Accept-Language": getLocale() };
        let signinLink = config.APIs.Web.URL + config.APIs.Web.resource.signin;
        if (role == 2) {
            var templateName = "inviteLandlord";
            var invitedAs = " as lister";
            signinLink = config.APIs.Web.URL + config.APIs.Web.resource.myproperties;
        } else {
            var templateName = "inviteRenter";
            var invitedAs = " as renter";
            signinLink = config.APIs.Web.URL + config.APIs.Web.resource.myrentals;
        }
        if (typeof leaseInfo[0].leaseid !== 'undefined') {
            signinLink = signinLink + '/' + leaseInfo[0].leaseid;
        }
        let signupLink = config.APIs.Web.URL + config.APIs.Web.resource.signup.replace(":random", leaseInfo.userinvited.emailVerifytoken);


        var mailData = { "template": templateName, "placeholder": { "fullname": leaseInfo.userinvited.fullname, "propertyaddress": leaseInfo[0].address, "signupLink": signupLink, "signinLink": signinLink }, "to": newemail, "subject": __("invitationReceived") }
        var notificationArr = [];
        notificationArr.push(httpHelper.requestAPI(config.APIs.user.URL, config.APIs.user.resource.sendmail, "POST", mailData, headersLang))

        let msg1 = __("invitationReceivedDesc");
        invitationReceivedDesc = msg1.replace("{address}", leaseInfo[0].address) + invitedAs;
        var invitationData = { "invitationid": leaseInfo.invitationData.id }
        notificationData = { "title": __("invitationReceived"), "description": invitationReceivedDesc, "data": invitationData, "type": "leaseInvitation" }

        addNotification = config.APIs.notification.resource.addNotification.replace(":userId", leaseInfo.userinvited.id)
        notificationArr.push(httpHelper.requestAPI(config.APIs.notification.URL, addNotification, "POST", notificationData, headersLang))

        Promise.all(notificationArr).then((data) => {
            console.log('data ', data);
        }).catch((err2) => {
            console.log(err2);
            logger.error(err2);
        });
    },

    ifSharedWithLandlordInternal: async (req, res, next) => {
        logger.info("ifSharedWithLandlordInternal : ", req);

        PropertyType.isSharedWithLandlord(req.value.params.renterid, req.value.params.landlordid, req.value.params.propid).then((sharedInfo) => {

            if (sharedInfo.length == 0 || sharedInfo[0].sharedprofilesection == undefined)
                throw new cutomError(__("noInfoFound"), 409);

            let isSharedCC = false;
            let sharedInfoObj = JSON.parse(sharedInfo[0].sharedprofilesection)
            if (sharedInfoObj.creditcheck != undefined && sharedInfoObj.creditcheck == true)
                isSharedCC = true;

            return res.json({ "response": { "data": [{ "isSharedCC": isSharedCC }] } });
        }).catch((err) => {
            console.log('err ', err);
            if (err.type != undefined && (err.type == 400 || err.type == 403 || err.type == 409 || err.type == 404))
                return res.status(err.type).json({ "details": [{ "message": err.message }] });
            else {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        })
    },
    getCurrentListingNDaysOld: (req, res, next) => {
        logger.info("getCurrentListingNDaysOld : ", req.params);
        async.waterfall([
            (callback) => {
                let lastDate = moment().utc().subtract(req.params.days, "days").format("YYYY-MM-DD");
                PropertyType.currentListingNDaysOld(lastDate).then(listings => {
                    callback(null, { code: 200, data: { "response": { "data": listings } } });
                }).catch(error => {
                    callback(error, { code: 500, data: { "details": [{ "message": __("internalServer") }] } });
                });
            }
        ], (err, data) => {
            if (err) {
                logger.error(err);
            }
            res.status(data.code).json(data.data);
        });
    },
    getManagersRenters: (req, res, next) => {
        logger.info("getManagersRenters : ", req.value);
        PropertyType.managersRenters(req.headers.userid, req.value.body.offset, req.value.body.noofrecord, (error, results) => {
            if (!error) {
                let userids = _.map(results[0], function (obj) {
                    return obj.renterid;
                });
                res.status(200).json({ response: { data: { totalRows: results[1][0].total_renters, recordSet: userids } } });
            } else {
                logger.error(error);
                res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            }
        });
    },

    savePrefernce: (req, res, next) => {
        logger.info("savePrefernce : ", req.value.body);
        let errors = [];
        async.waterfall([
            (callback) => {
                let timeNow = moment().utc().format('YYYY-MM-DD HH:mm:ss');
                async.forEachSeries(req.value.body.locations, (val, move) => {
                    let searchSrting = '';
                    req.value.body.address = val.searchstr;
                    req.value.body.latitude = val.latitude;
                    req.value.body.longitude = val.longitude;
                    if (typeof val.searchstr !== 'undefined' && val.searchstr !== '') {
                        val.searchstr = val.searchstr.replace(/,/g, "");
                        val.searchstr = val.searchstr.replace(/_/g, "\\_");
                        val.searchstr = val.searchstr.replace(/%/g, "\\%").split(" ");
                        val.searchstr.forEach((str) => {
                            searchSrting += (searchSrting !== '') ? " and (address like '%" + str + "%' or  city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')" : "(address like '%" + str + "%' or city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')";
                        });
                    }
                    req.value.body.searchstr = searchSrting;
                    PropertyType.savePrefernce(req.value.body, req.headers.userid, timeNow).then(response => {
                        move();
                    }).catch(error => {
                        errors.push(error);
                        console.log("Set Preference Error: ", error);
                        move();
                    });
                }, () => {
                    callback(null);
                });
            },
            (callback) => {
                if (!errors.length) {
                    callback(null, { responseCode: 200, response: { "details": [{ "message": __("prefSaved") }] } });
                    return false;
                }
                callback(errors, { responseCode: 500, response: { details: [{ message: __("internalServer") }] } });
            }
        ], (err, data) => {
            if (err) {
                logger.error(err);
            }
            res.status(data.responseCode).json(data.response);
        });
    },
	
	saveUserIdentity: (req, res, next) => {
        logger.info("saveUserIdentity : ", req.value.body);
        return PropertyType.saveUserIdentity(req.value.body)
		.then(() => {
			return res.json({ "details": [{ "message": __("usrIdentitySaved") }] });
		}).catch((err) => {
			logger.error(err);
			return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
		});
    },
	
    savePrefernceBakup: (req, res, next) => {
        logger.info("savePrefernce : ", req.value.body);
        console.log("Insie savePrefernce");
        req.value.body.address = req.value.body.searchstr;
        if (req.value.body.searchstr != undefined && req.value.body.searchstr != '') {
            var abc = "";
            searchstr = req.value.body.searchstr.replace(/,/g, "");
            searchstr = searchstr.replace(/_/g, "\\_");
            searchstr = searchstr.replace(/'/g, "\\'");
            searchstr = searchstr.replace(/%/g, "\\%").split(" ");
            searchstr.forEach((str) => {
                abc += (abc != '') ? " and (address like '%" + str + "%' or  city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')" : "(address like '%" + str + "%' or city_town like '%" + str + "%' or state_province_region like '%" + str + "%' or zip_postcode like '%" + str + "%' or streetno like '%" + str + "%' or streetname like '%" + str + "%' or listingtitle like '%" + str + "%' or description like '%" + str + "%')";
            })
            req.value.body.searchstr = abc;
        }
        return PropertyType.savePrefernce(req.value.body, req.headers.userid)
            .then(() => {
                return res.json({ "details": [{ "message": __("prefSaved") }] });
            }).catch((err) => {
                logger.error(err);
                return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
            });
    },
    getPrefernces: (req, res, next) => {
        logger.info("getPrefernces");
        let allCategoies = [];
        PropertyType.getAllCategories().then(categoies => {
            allCategoies = categoies;
            return PropertyType.getPrefernces(req.headers.userid);
        }).then((prefernces) => {
            prefernces = _.map(prefernces, obj => {
                if (typeof obj.searchjson === "string") {
                    obj.searchjson = JSON.parse(obj.searchjson);
                }
                if (obj.searchjson.categorysubcatid === 0) {
                    obj.searchjson.categorysubcatid = '';
                }
                if (typeof obj.searchjson.categorysubcatid !== 'string') {
                    obj.searchjson.categorysubcatid = '' + obj.searchjson.categorysubcatid;
                }
                if (typeof obj.searchjson.categorysubcatid !== 'undefined' && obj.searchjson.categorysubcatid) {
                    obj.searchjson.categorysubcatid = _.map(obj.searchjson.categorysubcatid.split(','), val => {
                        return parseInt(val);
                    });
                } else {
                    obj.searchjson.categorysubcatid = [];
                }
                return obj;
            });
            prefernces = utilityHelper.groupPreferncesByCategory(prefernces, allCategoies);
            return res.json({ "response": { "data": prefernces } });
        }).catch((err) => {
            console.log(err);
            logger.error(err);
            return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
        });

    },
    removePrefernce: (req, res, next) => {
        logger.info("removePrefernce: ", req.headers.userid, req.value.params.id);

        return PropertyType.removePrefernce(req.headers.userid, req.value.params.id)
            .then((removeStatus) => {

                if (removeStatus[0].action == 'noPrefExists') {
                    throw new cutomError(__("noPrefExists"), 404);
                } else if (removeStatus[0].action == 'removed') {
                    return res.json({ "details": [{ "message": __("prefRemoved") }] });
                } else {
                    throw new cutomError(__("errInPrefRem"), 400);
                }

            }).catch((err) => {
                if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404))
                    return res.status(err.type).json({ "details": [{ "message": err.message }] });
                else {
                    logger.error(err);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            });
    },

    hasConsent: (req, res, next) => {
        logger.info("hasConsent: ", req.value.params.landlordid, req.value.params.renterid);

        var consent = false;
        return PropertyType.getAllApplications(req.value.params.landlordid, req.value.params.renterid)
            .then((applications) => {

                if (applications.length > 0) {
                    applications.forEach((application) => {
                        let infoShared = JSON.parse(application.sharedprofilesection);
                        if (infoShared.creditcheck) {
                            consent = true;
                        }
                    });
                }

                return res.json({ "response": { "data": { "consent": consent } } });

            }).catch((err) => {
                console.log(err);
                if (err.type != undefined && (err.type == 400 || err.type == 409 || err.type == 404))
                    return res.status(err.type).json({ "details": [{ "message": err.message }] });
                else {
                    logger.error(err);
                    return res.status(500).json({ "details": [{ "message": __("internalServer") }] });
                }
            })


    }
};
module.exports = selfPropType;