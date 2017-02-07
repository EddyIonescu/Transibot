'use strict';

// Real-Time Retrieval
// Input: Stop coordinates
// Output: arrival times for next buses for all routes serving that stop

function debug(message) {
	console.log(message);
}

module.exports = {
	
	getClosestStops: function (lat, long, grt_stops) {
		var geolib = require('geolib');
		// Idea: GTFS is standardized, so it'll work across other transit systems, like the TTC, etc.
		// parseGTFS();

		// Stops hardcoded for GRT; TODO: use GTFS file from their website
		var stops = grt_stops.getStops();

		stops = stops.stops;

		return [stops, geolib.orderByDistance({ lat: lat, long: long }, stops)]; // key is index in stops

	},

	// sorted stops -> stop ID
	getWhichStop: function(senderID, callSendAPI, stops, locs, lat, long) {
		var geolib = require('geolib');

		// show within 1km - then take top stopLimit if too many
		var radius = 1000;
		var stopLimit = 8;

		// if 2+ stops have the same names, merge them (so multiple IDs for a stop), meaning that payload is a list
		// then show buses arriving at that stop from first to last
		var stopReplies = [];
		var stopNames = new Map(); // stopName -> stopIDs

		// when looking for duplicate names, only consider the first nameMin characters
		var nameMin = 16;

		locs.forEach((loc) => {
			var distance = geolib.getDistance(stops[loc.key], {lat: lat, long: long});
			if(distance < radius) {
				const payload = ["GRT" + stops[loc.key].id];
				stopNames.set(stops[loc.key].name.substring(0, nameMin), payload);
				var quickReply = {content_type: "text", title: stops[loc.key].name, payload: payload};
				stopReplies.push(quickReply);
			}
		});

		// elements with duplicate names get removed (except for the original), and stopNames map is initialized
		stopReplies = stopReplies.filter((quickReply) => {
			debug(quickReply);
			if(!stopNames.get(quickReply.title.substring(0, nameMin)).includes(quickReply.payload[0])) {
				stopNames.set(quickReply.title.substring(0, nameMin), 
					stopNames.get(quickReply.title.substring(0, nameMin)).concat(quickReply.payload));
				return false
			}
			return true
		}).map((quickReply) => {
			quickReply.payload = stopNames.get(quickReply.title.substring(0, nameMin)).join("*");
			return quickReply;
		});
		
		stopReplies = stopReplies.slice(0, stopLimit);

		if(stopReplies.length === 0) {
			var messageData = {
				recipient: {
					id: senderID
				},
				message: {
					text: "Sorry, there are no stops within 1 km. Are you in Waterloo Region, Canada?",
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
						text: "Which stop?",
						quick_replies: stopReplies
					}
				};
			debug(messageData);
			callSendAPI(messageData);
		}
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
					var nextMsg = "Next Buses:";
					if(answers.length == 1) nextMsg = "Next Bus:";
					sendTextMessage(senderID, nextMsg);
					
					setTimeout(sendTextMessageDelay, delay);
					// Goal: send buses with delays so that it can animate nicely on Messenger

					function sendTextMessageDelay () {
						if(answers.length==1) {
							sendLastTime();
							return;
						}
						sendTextMessage(senderID, answers[0]);
						answers = answers.slice(1);
						setTimeout(sendTextMessageDelay, delay);
					}

					function sendLastTime() {
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
