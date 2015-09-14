
var _ = require('underscore');
var utils = require('./utils.js');

var Refugee = require('./refugee.js');
var moment = require('moment');

window.SMART_SPREAD_ENABLED = true;

var RefugeeModel = function(fc, asylumData, regionalData, divider, labels) {
	this.fc = fc;
	this.asylumData = asylumData;
	this.regionalData = regionalData;
	this.labels = labels;
	this.refugees = [];
	this.activeRefugees = [];
	this.divider = divider;
	this.refugeesOnPath = {};
	this.initialize();

	this.onRefugeeStarted = null;
	this.onRefugeeUpdated = null;
	this.onRefugeeFinished = null;
};


RefugeeModel.prototype.initialize = function() {
	console.time("refugee adding");
	this.asylumData.forEach(this._addPeopleFromValidCountries.bind(this));
	console.timeEnd("refugee adding");
	console.time("regional adding");
	this.regionalData.forEach(this._addPeopleFromValidCountries.bind(this));
	console.timeEnd("regional adding");
	console.time("refugee sorting");
	this.refugees.sort(function(a, b) {
		return a.startMomentUnix - b.startMomentUnix;
	});
	console.timeEnd("refugee sorting");

	this.refugeeIndex = 0;
};


RefugeeModel.prototype._addPeopleFromValidCountries = function(item) {
	if (utils.getFeatureForCountry(this.fc, item.ac) == null) {
		console.log("asylum country " + item.ac +  "not in map, skipping");
	} else if (utils.getFeatureForCountry(this.fc, item.oc) == null) {
		console.log("origin country " + item.oc +  "not in map, skipping");
	} else if (item.count > 0) {
		this.addRefugees(item.oc, item.ac, item.count / this.divider, item.month - 1, item.year);
	}
};

RefugeeModel.prototype._increaseRefugeeEnRoute = function(start, end) {
	if (!(start in this.refugeesOnPath)) {
		this.refugeesOnPath[start] = {};
	}
	if (!(end in this.refugeesOnPath[start])) {
		this.refugeesOnPath[start][end] = 1;
	} else {
		this.refugeesOnPath[start][end]++;
	}

	return this.refugeesOnPath[start][end];
};

RefugeeModel.prototype.update = function() {
	var r;

	// add new ones
	do {
		r = this.refugees[this.refugeeIndex];
		if (r != null && r.isPastStartMoment(this.currentMoment)) {
			if (window.SMART_SPREAD_ENABLED) {
				r.setRouteRefugeeCount(this._increaseRefugeeEnRoute(r.startPoint, r.endPoint));
			}
			this.activeRefugees.push(r);
			this.refugeeIndex++;
			this.onRefugeeStarted(r);
		} else {
			break;
		}
	} while (true);


	// update current ones
	var stillActive = [];
	var length = this.activeRefugees.length;

	for (var i = 0; i < length; i++) {
		r = this.activeRefugees[i];
		r.update(this.currentMoment);

		if (r.arrived) {
			if (window.SMART_SPREAD_ENABLED) {
				this.refugeesOnPath[r.startPoint][r.endPoint]--;
			}
			this.onRefugeeFinished(r);
		} else {
			stillActive.push(r);
			this.onRefugeeUpdated(r);
		}
	}

	this.activeRefugees = stillActive;
};


RefugeeModel.prototype.addRefugees = function(startCountry, endCountry, count, month, year) {
	_.times(Math.round(count), function() { // should it be Math.floor?
		this.refugees.push(this.createRefugee(startCountry, endCountry, month, year));
	}.bind(this));
};


RefugeeModel.prototype.kmhToDegsPerH = function(kmh) {
	return kmh / 111;
};


/*
 * Return the center point of the given country
 */
RefugeeModel.prototype.createCenterCountryPoint = function(country) {
	var feature = utils.getFeatureForCountry(this.fc, country);
	if (feature == null) {
		throw "could not find feature for " + country;
	}

	switch (country) {
		case "FRA":
			return [2.449486512892406, 46.62237366531258]; 
		case "SWE":
			return [15.273817, 59.803497];
		case "FIN":
			return [25.356445, 61.490593];
		case "NOR":
			return [8.506239, 60.975869];
		case "GBR":
			return [-1.538086, 52.815213];
		case "GRE":
			return [39.575792,21.708984];

	}
	return utils.getCenterPointForCountryBorderFeature(feature);
};


/*
 * Create a random point within the given country
 */
RefugeeModel.prototype.createRandomCountryPoint = function(country) {
	var feature = utils.getFeatureForCountry(this.fc, country);
	if (feature == null) {
		throw "could not find feature for " + country;
	}
	return utils.getRandomPointForCountryBorderFeature(feature);
};


function daysInMonth(month,year) {
	return new Date(year, month, 0).getDate();
}


/*
 * Get a speed for a new refugee in km / h;
 */
RefugeeModel.prototype.prepareRefugeeSpeed = function() {
	return Math.random() * 2 + 4;
};


RefugeeModel.prototype.prepareRefugeeEndMoment = function(month, year) {
	return moment(new Date(year, month, 1).getTime() +
		Math.random() * daysInMonth(month, year) * 86400000); // ms in day
};


RefugeeModel.prototype.createRefugee = function(startCountry, endCountry, month, year) {
	var r = new Refugee(
		//utils.getLabelPointForCountry(this.labels, startCountry),
		//utils.getLabelPointForCountry(this.labels, endCountry),
		window.RANDOM_START_POINT ? this.createRandomCountryPoint(startCountry) : this.createCenterCountryPoint(startCountry),
		this.createCenterCountryPoint(endCountry),
		endCountry,
		this.prepareRefugeeSpeed(),
		this.prepareRefugeeEndMoment(month, year)
	);

	return r;
};


module.exports = RefugeeModel;
