'use strict';

// Real-Time Retrieval
// Input: Stop coordinates
// Output: arrival times for next buses for all routes serving that stop

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
		// show within 1km - then take top 8 if too many
		// if 2+ stops have the same names, include their IDs
		var stopReplies = [];
		var stopNames = new Map();
		var nameMin = 16;
		locs.forEach(function(loc) {
			var distance = geolib.getDistance(stops[loc.key], {lat: lat, long: long});
			if(distance < 1000) {
				stopNames.set(stops[loc.key].name.substring(0, nameMin+1), "GRT" + stops[loc.key].id);
				var quickReply = {content_type: "text", title: stops[loc.key].name, payload: "GRT" + stops[loc.key].id};
				
				stopReplies.push(quickReply);
			}
		});
		while(stopReplies.length > 5) stopReplies.pop();
		stopReplies = stopReplies.map(function(quickReply) {
				console.log(quickReply);
				if(stopNames.get(quickReply.title.substring(0, nameMin+1)) !== quickReply.payload) {
					stopNames.set(quickReply.title.substring(0, nameMin+1), quickReply.payload);
					return {content_type: quickReply.content_type, 
							title: quickReply.payload.substring(3) + " " + quickReply.title,
							payload: quickReply.payload};
				}
				return quickReply;
		});
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
			console.log(messageData);
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

						console.log("Got a response: ");
						var buses = nathaniel.data;
						if (buses === undefined) {
							reject("Could not get real-time info for this stop - buses may not be running.");
						}
						else {
							var answer = buses.reduce(function(acc, bus) {
								var answer = bus.name + " - \n";
								var arrivals = [bus]; // bus.stopDetails; 
								// GRT changed their API!
								// Now bus.stopDetails only contains scheduled departures
								// and the only real-time departure is now within the bus field.
								// Fourtunatly, the property names are consistent, so we put the bus into a list
								// as to "patch" the code while making minimal changes.
								var hasRealTime = arrivals.reduce(function(acc, arrival) {
									if (arrival.hasRealTime) {
										console.log("REAL TIME");
										// convert from seconds of day to hh:mm:ss in 24-hour time
										const fromMinutes = function (minutes) {
											var modulo = minutes % 60;
											return String.prototype.concat(
												format(((minutes - modulo) / 60) % 24),
												":",
												format(modulo)
											);
										};
										const fromSeconds = function (seconds) {
										var modulo = seconds % 60;
											return String.prototype.concat(
												fromMinutes((seconds - modulo) / 60),
												":",
												format(modulo)
											);
										};
										const format = function (num) {
											var n = String(num);
											if (num === 0) {
												n = '00';
											}
											else if (num < 10) {
												n = String.prototype.concat(0, num);
											}
											return n;
										};
										const seconds = arrival.departure;
										answer += `${fromSeconds(seconds)} \n`;
										return true;
									}
									return acc;
								}, false);
								if(hasRealTime) return acc + answer;
								return acc;
							}, "");
							if(answer==="") reject("Sorry, couldn't find any real-time arrivals for this stop.");
							resolve(answer);
						}
					});
				}).on('error', function (e) {
					console.log("Got an error: ", e);
					reject("GRT could not be reached");
				})
			}).then(
				function (answer) {
					console.log("Success");
					console.log(answer);
					//sendTextMessage(senderID, `Next Buses: ${answer}`);
					var messageData = {
						recipient: {
							id: senderID
						},
						message: {
							text: `Next Buses:\n${answer}`,
							quick_replies: [
								{
									content_type: "location",
								},
							]
						}
					};
					callSendAPI(messageData);
					return answer;
				}
			).catch(
				function (errorMessage) {
					console.log("Error");
					console.log(errorMessage);
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
	}
};
