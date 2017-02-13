'use strict';

// Real-Time Retrieval
// Input: Stop coordinates
// Output: arrival times for next buses for all routes serving that stop

function debug(message) {
	console.log(message);
}

// sorted stops -> stop ID
function getWhichStop (senderID, callSendAPI, stops, lat, long) {
	// show within 1km - then take top 8 if too many
	// if 2+ stops have the same names, include their IDs
	var stopButtons = [];
	var stopNames = new Map();
	var nameMin = 16;
	var stopLimit = 10;
	
	stops.forEach(function(stop) {
		stopNames.set(stop.name.substring(0, nameMin+1), stop._id);
		if(stop.agency.name === "waterloo-grt") {
			stop.localid = "GRT" + stop.localid;
		}
		stopButtons.push(
			{
				title: stop.name,
				buttons: [
							{
								type: "postback", title: stop.localid, payload: stop.localid
							}
							]
			});
	});

	stopButtons = stopButtons.slice(0, stopLimit);
	debug(stopButtons);

	if(stopButtons.length === 0) {
		var messageData = {
			recipient: {
				id: senderID
			},
			message: {
				text: "Sorry, there are no stops within 2 km. Are you in Waterloo Region, Canada?",
				quick_replies: [ 
							{
								content_type: "location",
							},
						],
				metadata: "NO_STOPS"
			}
		};
		callSendAPI(messageData);
	}
	else {
		var messageData = {
				recipient: {
					id: senderID
				},
				message: {
					attachment: {
						type: "template",
						payload: {
							template_type: "generic",
							elements: stopButtons
						}
					}
				}
			};
		debug(messageData);
		callSendAPI(messageData);
	}
}

module.exports = {

	getClosestStops: function (lat, long, senderID, callSendAPI) {
		//var geolib = require('geolib');

		// todo: use mongoose and define schema
		//var mongoose = require('mongoose');

		var MongoClient = require("mongodb")
		var fs = require('fs');
		var pass = fs.readFileSync('.mongopass', 'utf8');
		MongoClient.connect("mongodb://eddy:" + pass.slice(0,-1) + "@172.31.25.113:27017/transistops", function(err, db) {
		if(err) { return console.dir(err); }

			var collection = db.collection('stops');
			collection.ensureIndex({ location: "2dsphere" })
			collection.find(
			{
				location:
				{ $near :
					{
						$geometry: { type: "Point",  coordinates: [ long, lat ] },
						$minDistance: 0,
						$maxDistance: 2000
					}
				}
			}
			).toArray(function(err, db_stops) {
				debug("error:");
				debug(err);
				debug("mongostops:");
				//debug(db_stops);
				getWhichStop(senderID, callSendAPI, db_stops, lat, long);
			});

		});

		// Idea: GTFS is standardized, so it'll work across other transit systems, like the TTC, etc.
		// parseGTFS();

		// Stops hardcoded for GRT; TODO: use GTFS file from their website
		//var stops = grt_stops.getStops();

		//stops = stops.stops;

		//return [stops, geolib.orderByDistance({ lat: lat, long: long }, stops)]; // key is index in stops

	},

	getNextBuses: function (stopid, senderID, sendTextMessage, callSendAPI) {

		return new Promise(
			function (resolve, reject) {
				var http = require('http');

				if(stopid.substring(0, 3) == "GRT") stopid = stopid.substring(3);
				else reject("Did not select a GRT stop");

				var url = "http://nwoodthorpe.com/grt/V2/livetime.php?stop=" + stopid;

				http.get(url, function (res) {
					var body = '';

					res.on('data', function (chunk) {
						body += chunk;
					});

					res.on('end', function () {
						var nathaniel = JSON.parse(body);

						debug("Made contact to GRT API: ");
						var buses = nathaniel.data;
						if (buses === undefined) {
							reject("Could not get real-time info for this stop - buses may not be running.");
						}
						else {
							var answers = buses.reduce((answers_acc, bus) => {
								var answer = bus.name + "\n";
								var arrivals = [bus]; // bus.stopDetails; 
								// GRT changed their API!
								// Now bus.stopDetails only contains scheduled departures
								// and the only real-time departure is now within the bus field.
								// Fourtunatly, the property names are consistent, so we put the bus into a list
								// as to "patch" the code while making minimal changes.
								var hasRealTime = arrivals.reduce((acc, arrival) => {
									if (arrival.hasRealTime) {
										// convert from seconds of day to hh:mm:ss in 24-hour time
										const fromMinutes = function (minutes) {
											var modulo = minutes % 60;
											return String.prototype.concat(
												format(((minutes - modulo) / 60) % 24), ":", format(modulo)
											);
										};
										const fromSeconds = function (seconds) {
										var modulo = seconds % 60;
											return String.prototype.concat(
												fromMinutes((seconds - modulo) / 60), ":", format(modulo)
											);
										};
										const format = function (num) {
											var n = String(num);
											if (num === 0) n = '00';
											else if (num < 10) n = String.prototype.concat(0, num);
											return n;
										};
										const seconds = arrival.departure;
										answer += `${fromSeconds(seconds)}\n`;
										return true;
									}
									return acc;
								}, false);
								if(hasRealTime) {
									answers_acc.push(answer);
									return answers_acc;
								}
								return answers_acc;
							}, []);
							if(answers.length == 0) reject("Sorry, couldn't find any real-time arrivals for this stop.");
							resolve(answers);
						}
					});
				}).on('error', function (e) {
					debug("Got an error: ", e);
					reject("GRT could not be reached");
				})
			}).then(
				function (answers) {
					debug("Success");
					debug(answers);
					var delay = 700;
					//sendTypingOn();
					var nextMsg = "Next Buses:";
					if(answers.length == 1) nextMsg = "Next Bus:";
					sendTextMessage(senderID, nextMsg);
					
					setTimeout(sendTextMessageDelay, delay);
					// Goal: send buses with delays so that it can animate nicely on Messenger

					function sendTextMessageDelay () {
						//sendTypingOn();
						if(answers.length==1) {
							sendLastTime();
							return;
						}
						sendTextMessage(senderID, answers[0]);
						answers = answers.slice(1);
						setTimeout(sendTextMessageDelay, delay);
					}

					function sendLastTime() {
						//sendTypingOff()
						var messageData = {
							recipient: {
								id: senderID
							},
							message: {
								text: answers[0], 
								// text is required so we'll put the last time in instead of "where are you?"
								quick_replies: [
									{
										content_type: "location",
									},
								]
							}
						};
						callSendAPI(messageData);
					}

					function sendTypingOn() {
						var messageData = {
							recipient: {
								id: senderID
							},
							sender_action: "typing_on"
						};
						callSendAPI(messageData);
					}

					function sendTypingOff() {
						var messageData = {
							recipient: {
								id: senderID
							},
							sender_action: "typing_off"
						};
						callSendAPI(messageData);
					}

					return answers;
				}
			).catch(
				function (errorMessage) {
					debug("Error");
					debug(errorMessage);
					//sendTextMessage(senderID, errorMessage);
					var messageData = {
						recipient: {
							id: senderID
						},
						message: {
							text: errorMessage,
							quick_replies: [
								{
									content_type: "location",
								},
							]
						}
					};
					callSendAPI(messageData);
					return errorMessage;
				}
			);
	},

	
};
