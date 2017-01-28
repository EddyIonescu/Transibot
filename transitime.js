'use strict';

// Real-Time Retrieval
// Input: Stop coordinates
// Output: arrival times for next buses for all routes serving that stop

// Obtain GTFS Info using Node-GTFS, which puts it into a MongoDB database


module.exports = {

	getClosestStops: function (lat, long, grt_stops) {
		var geolib = require('geolib')
		// Idea: GTFS is standardized, so it'll work across other transit systems, like the TTC, etc.
		// parseGTFS();

		// Stops hardcoded for GRT; TODO: use GTFS file from their website
		var stops = grt_stops.getStops();

		stops = stops.stops;

		return [stops, geolib.orderByDistance({ lat: lat, long: long }, stops)]; // key is index in stops

	},

	getNextBuses: function (stop, senderID, sendTextMessage) {

		return new Promise(
			function (resolve, reject) {
				var http = require('http');
				var stopid = stop.id;
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
							reject("GRT is down or buses aren't running");
						}
						else {
							var answer = "";
							for (var i = 0; i < buses.length; i++) {
								console.log(buses[i].name);
								answer += buses[i].name + " - ";
								var arrivals = buses[i].stopDetails;
								for (var j = 0; j < arrivals.length; j++) {
									var arrival = arrivals[j];
									if (arrival.hasRealTime) {

										const fromMinutes = function (minutes) {
											var modulo = minutes % 60;
											return String.prototype.concat(
												format((minutes - modulo) / 60),
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

										const format = function (int) {
											var n = String(int);
											if (int === 0) {
												n = '00';
											} 
											else if (int < 10) {
												n = String.prototype.concat(0, int);
											}
											return n;
										};

										const seconds = arrival.departure;
										answer += `${fromSeconds(seconds)} \n`;

										
								
									}
								}
							}
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
				sendTextMessage(senderID, `Next Buses: ${answer}`);
				return answer;
			}
			).catch(
			function (errorMessage) {
				console.log("Error");
				console.log(errorMessage);
				sendTextMessage(senderID, errorMessage);
				return errorMessage;
			}
			);
	}
};
