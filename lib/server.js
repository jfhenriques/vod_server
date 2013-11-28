
var snmp = require('snmp-native');



const ifaceNameOID = ".1.3.6.1.2.1.31.1.1.1.1", // IF-MIB::ifName.$ifaceID
	  ifaceOutOctetsOID = ".1.3.6.1.2.1.31.1.1.1.10"; // IF-MIB::ifHCOutOctets.$ifaceID
	  ifaceSetCacheOID = ".1.3.6.1.4.1.8072.1.5.3.1.2.1.3.6.1.2.1.2.2" // Set ifTable cache timeout

var _debug = false,
	_id = 0,
	priorityList = [];



function describeServer(host, oid)
{
	return "[" + host + ", " + oid + "] ";
}

function walkDescriptions(host, session, callback)
{
	if( !session )
		throw new Error("Server var or server snmp var is invalid");

	else
	{
		session.getSubtree({ oid: ifaceNameOID }, function (error, vb)
		{
			var describe = describeServer(host, ifaceNameOID);

			if (error)
			{
				console.error( describe + "Error walking descriptions", error)

				callback( error );
			}
			else
			{
				if( _debug )
					console.log(describe + "Got descriptions");

				callback(undefined, vb);
			}
		});
	}
}

function getOutOctets(host, session, ifaceId, callback)
{
	if(    !session
		|| !ifaceId )
		throw new Error("Server var or server snmp var or server iface id is invalid");

	else
	{
		var thisOID = ifaceOutOctetsOID + ifaceId ;

		session.get({ oid: thisOID }, function (error, vb)
		{
			var describe = describeServer(host, thisOID);

			if (error)
			{
				console.error( describe + "Error getting iface out octets", error)

				callback( error );
			}
			else
			if( vb.length == 0 )
			{
				console.error( describe + "Wrong response received?" )

				callback( "Wrong response received" );
			}
			else
			{
				if( _debug )
					console.log(describe + "Got iface out octets");

				callback(undefined, vb[0]);
			}
		});
	}
}

// function isPositive(value, min)
// {
// 	if( min == undefined )
// 		min = 0 ;

// 	return value !== undefined
// 		&& !isNaN( value )
// 		&& value >= min ;
// }

function parseInteger(value, def, min)
{
	if( value === undefined )
		return def;

	if( min === undefined )
		min = 0 ;

	var out = parseInt( value );

	return ( isNaN( out ) || out < min )
				? def
				: out ;
}
function parseFloatNumber(value, def, min)
{
	if( value === undefined )
		return def;

	if( min === undefined )
		min = 0.0 ;

	var out = parseFloat( value );

	return ( isNaN( out ) || out < min )
				? def
				: out ;
}


var Server = exports = module.exports = function(options)
{
	if( !(this instanceof Server) )
		return new Server();

	this.options = options || {} ;
	this._id = _id++;

	if( !this.options.publicHost )
		this.options.publicHost = this.options.host ;
	
	this.options.port = parseInteger( this.options.port , 161 , 1 )

	if( !this.options.community )
		this.options.community = "public" ;

	this.options.iface = ( !!this.options.iface ) ? this.options.iface.toLowerCase() : "eth0" ;

	this.options.ifaceRateMbits = parseInteger( this.options.ifaceRateMbits , 100 , 1 ) ;

	this.ifaceRate = ( 1024 * 1024 * ( this.options.ifaceRateMbits / 8 ) ) | 0 ;

	this.ifaceID = undefined ;
	this.snmpSession = undefined;

	this.lastUpdateTime = new Date(0);

	this.updateInProgress = false;

	this.lastTXValue = undefined ;
	this.lastTXDate = undefined ;

	this.rates = [];
	this.metric = 0;
	this.priority = -1;
}




Server.getPriorityList = function(listId)
{
	if( listId < 0 )
		return undefined;

	if( listId >= priorityList.length )
		return ( priorityList[listId] = [] ) ;

	return priorityList[listId] ;
}

Server.removeFromPriorityList = function(server)
{
	server = server || {};

	if(    server._id !== undefined
		&& server.priority >= 0 )
	{
		var pList = Server.getPriorityList(server.priority);

		for( var i = 0; i < pList.length; i++ )
		{
			if( pList[i]._id === server._id )
			{
				server.priority = -1;
				pList.splice(i,1);

				return true;
			}
		}
	}

	return false;
}

Server.changePriorityList = function(server, listId)
{
	server = server || {};

	if( server._id !== undefined )
	{
		if(    listId === undefined
			|| listId < 0 )
			listId = 0;

		if( server.priority >= 0 )
			Server.removeFromPriorityList(server);

		var pList = Server.getPriorityList(listId);

		server.priority = listId;
		pList.push( server );

		return true;
	}

	return false;
}

Server.getPriorityListSize = function()
{
	return priorityList.length;
}



Server.setUpdateInterval = function(secs)
{
	Server.UPDATE_INTERVAL = parseInteger( secs, 30 ) * 1000 ;
}

Server.setIfaceTimeout = function(secs)
{
	Server.IFACE_TIMEOUT =
			( !secs )
				? undefined
				: parseInteger( secs, 5 ) ;
}

Server.setMetricTimeframe = function(secs, lastSecs, lastSecsWeight)
{
	if( secs === false )
	{
		Server.METRIC_ARRAY_SIZE = false;
		Server.METRIC_ARRAY_LAST_SECS_SIZE = undefined;
		Server.METRIC_LAST_SECS_WEIGHT = undefined ;
	}
	else
	{
		var val = parseInteger( secs, 60 ) * 1000,
			valLast = parseInteger( lastSecs, 10 ) * 1000;

		Server.METRIC_ARRAY_SIZE = Math.ceil( val / Server.UPDATE_INTERVAL );
		Server.METRIC_ARRAY_LAST_SECS_SIZE = Math.ceil( valLast / Server.UPDATE_INTERVAL );
		Server.METRIC_LAST_SECS_WEIGHT = parseFloatNumber( lastSecsWeight, 0.7 );

		if( Server.METRIC_ARRAY_SIZE <= 0 )
			Server.METRIC_ARRAY_SIZE = 10 ;

		if( Server.METRIC_ARRAY_LAST_SECS_SIZE <= 0 )
			Server.METRIC_ARRAY_LAST_SECS_SIZE = 2 ;
	}
}


Server.initialize = function(options)
{
	options = options || {} ;

	
	Server.setUpdateInterval( options.updateInterval );

	Server.setIfaceTimeout( options.ifaceTimeout );

	Server.setMetricTimeframe( options.metricTimeframe, options.metricLastSecs, options.metricLastSecsWeight ) ;

	if( options.debug )
		_debug = options.debug;

	Server.USE_PRIORITY_LISTS = !!(options.priorityLists);
}

Server.setUpdateInterval( 30 );
Server.setIfaceTimeout( 5 );
Server.setMetricTimeframe( 60 );
Server.USE_PRIORITY_LISTS = true;


Server.deserialize = function(obj)
{
	return ( !!obj )
			? new Server( obj )
			: undefined;
}

Server.prototype.isValid = function()
{
	return !!this.snmpSession ;
}


Server.prototype.createSession = function(callback)
{
	function _call_callback(error)
	{
		if( callback )
			callback(error);
	}

	if( !this.options.host )
		_call_callback("Host is not set");

	else
	{
		var self = this;

		process.nextTick(function(){

			var session = new snmp.Session({ host: self.options.host, port: self.options.port, community: self.options.community });

			walkDescriptions(self.options.host, session, function(error, vb) {

				if( error )
					_call_callback(error);

				else
				if( !(vb instanceof Array) )
					_call_callback("vb is not an array");

				else
				{
					var i,j;
					for(i = 0; i < vb.length; i++)
					{
						j = vb[i];

						if(    j
							&& j.oid
							&& j.oid instanceof Array
							&& j.oid.length > 0
							&& j.type === 4
							&& j.value
							&& j.value.toLowerCase() === self.options.iface )
						{
							self.ifaceID = "." + j.oid[ j.oid.length - 1];

							break;
						}
					}

					if( self.ifaceID !== undefined )
					{
						function _finish()
						{
							self.snmpSession = session;
							_call_callback(undefined);
						}

						if( !Server.IFACE_TIMEOUT )
							_finish();

						else
						{
							session.set({ oid: ifaceSetCacheOID, type: 2, value: Server.IFACE_TIMEOUT }, function (error) {

								var describe = describeServer(self.options.host, ifaceSetCacheOID);

								if( _debug )
									console.log( describe + "Requested nsCacheTimeout change for ifTable to " + Server.IFACE_TIMEOUT + " secs [No guarantee that it was changed]");

								_finish();
							});
						}
					}
					else
						_call_callback("Iface name not found");
				}
			});
			
		});
	}
}


Server.prototype.checkUpdate = function(force, callback)
{
	if(    !callback
		&& force
		&& typeof(force) === 'function' )
	{
		callback = force;
		force = false;
	}

	if(    !this.isValid()
		|| this.updateInProgress )
	{
		if( callback )
			callback("invalid", this);
	}

	else
	{
		if(    force
			|| (new Date()).getTime() >= (this.lastUpdateTime.getTime() + Server.UPDATE_INTERVAL) )
		{
			this.updateInProgress = true;

			var self = this;

			function _finish(error, date)
			{
				self.updateInProgress = false;
				self.lastUpdateTime = date;

				if(    Server.USE_PRIORITY_LISTS
					&& self.priority > 0 )
					Server.changePriorityList( self, 0 );

				if( callback )
					callback(error, self);
			}
			process.nextTick(function(){

				getOutOctets(self.options.host, self.snmpSession, self.ifaceID, function (error, vb) {

					var date = new Date();

					if( error )
						_finish(error, date);

					else
					if(    vb.value === undefined
						|| vb.type !== 70 )
						_finish("Value not defined", date);

					else
					{
						if ( self.lastTXValue !== undefined )
						{
							var delta = ( 1000 * ( vb.value - self.lastTXValue ) ) / ( date.getTime() - self.lastTXDate.getTime() ) ;

							if( !Server.METRIC_ARRAY_SIZE )
								self.metric = delta;

							else
							{
								self.rates.push( delta );

								if( self.rates.length > Server.METRIC_ARRAY_SIZE )
									self.rates.shift(); // remove array head

								self.metric = 0;

								var tmpFirstMult = ( self.rates.length > Server.METRIC_ARRAY_LAST_SECS_SIZE )
														? ( Server.METRIC_LAST_SECS_WEIGHT / Server.METRIC_ARRAY_LAST_SECS_SIZE )
														: ( 1.0 / self.rates.length ) ;
									tmpLastMult = ( 1.0 - Server.METRIC_LAST_SECS_WEIGHT ) / ( self.rates.length - Server.METRIC_ARRAY_LAST_SECS_SIZE ) ;

								// console.log( Server.METRIC_ARRAY_SIZE, Server.METRIC_ARRAY_LAST_SECS_SIZE, tmpFirstMult, tmpLastMult );

								for( var i = self.rates.length - 1, j = 0; i >= 0; i--, j++)
								{
									self.metric += self.rates[i] *
														( ( j < Server.METRIC_ARRAY_LAST_SECS_SIZE )
														? tmpFirstMult
														: tmpLastMult ) ;
								}
							}

							self.metric |= 0 ;

							console.log( self.options.name, vb.value - self.lastTXValue, "|", self.metric, delta, "| b/s" );
						}

						self.lastTXValue = vb.value;
						self.lastTXDate = date;

						_finish(undefined, date);
					}
				});

			});
		}
	}
}
