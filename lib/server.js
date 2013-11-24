
var snmp = require('snmp-native');



const ifaceNameOID = ".1.3.6.1.2.1.31.1.1.1.1", // IF-MIB::ifName.$ifaceID
	  ifaceOutOctetsOID = ".1.3.6.1.2.1.31.1.1.1.10"; // IF-MIB::ifHCOutOctets.$ifaceID
	  ifaceSetCacheOID = ".1.3.6.1.4.1.8072.1.5.3.1.2.1.3.6.1.2.1.2.2" // Set ifTable cache timeout


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
				console.log(describe + "Got iface out octets");

				callback(undefined, vb[0]);
			}
		});
	}
}

function isPositive(value, min)
{
	if( min == undefined )
		min = 0 ;

	return value !== undefined
		&& !isNaN( value )
		&& value >= min ;
}



/*
var Server = exports = module.exports = function(name, host, port, community, iface, ifaceRateMbits)
{
	if( !(this instanceof Server) )
		return new Server();

	this.name = name;
	this.host = host;

	if( !!port )
	{
		port = parseInt( port );
		if( !isNaN( port ) )
			this.port = port;
	}

	if( !this.port )
		this.port = 161 ;

	this.community = ( !!community ) ? community : "public" ;

	this.ifaceID = undefined ;

	this.iface = ( !!iface ) ? iface.toLowerCase() : "eth0" ;

	if( !!ifaceRateMbits )
	{
		ifaceRateMbits = parseInt( ifaceRateMbits );
		if( isNaN( ifaceRateMbits ) )
			ifaceRateMbits = 0;
	}

	if( ifaceRateMbits <= 0 )
		ifaceRateMbits = 100;

	this.ifaceRate = ( 1024 * 1024 * ( ifaceRateMbits / 8 ) ) | 0 ;

	this.snmpSession = undefined;

	this.lastUpdateTime = new Date(0);

	this.updateInProgress = false;

	this.lastTXValue = undefined ;
	this.lastTXDate = undefined ;

	this.rates = [];
}
*/

var Server = exports = module.exports = function(options)
{
	if( !(this instanceof Server) )
		return new Server();

	this.options = options || {} ;

	if( !!this.options.port )
		this.options.port = parseInt( this.options.port );

	if( !isPositive( this.options.port, 1 ) )
		this.options.port = 161 ;

	if( !this.options.community )
		this.options.community = "public" ;

	this.options.iface = ( !!this.options.iface ) ? this.options.iface.toLowerCase() : "eth0" ;

	if( !!this.options.ifaceRateMbits )
		this.options.ifaceRateMbits = parseInt( this.options.ifaceRateMbits );

	if( !isPositive( this.options.ifaceRateMbits, 1 ) )
		this.options.ifaceRateMbits = 100 ;

	this.ifaceRate = ( 1024 * 1024 * ( this.options.ifaceRateMbits / 8 ) ) | 0 ;

	this.ifaceID = undefined ;
	this.snmpSession = undefined;

	this.lastUpdateTime = new Date(0);

	this.updateInProgress = false;

	this.lastTXValue = undefined ;
	this.lastTXDate = undefined ;

	this.rates = [];
}

Server.setUpdateInterval = function(secs)
{
	if( secs )
		secs = parseInt( secs );

	if( !isPositive( secs ) )
		secs = 30 ;

	Server.UPDATE_INTERVAL = secs * 1000 ;
}

Server.setIfaceTimeout = function(secs)
{
	if( !secs )
		Server.IFACE_TIMEOUT = undefined ;

	else
	{
		secs = parseInt( secs );

		if(    isNaN( secs )
			|| secs <= 0 )
			secs = 5 ;

		Server.IFACE_TIMEOUT = secs ;
	}
}

Server.setUpdateInterval( 30 );
Server.setIfaceTimeout( 5 );

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
			callback("invalid");
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

				if( callback )
					callback(error);
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
							var delta = ( ( 1000 * ( vb.value - self.lastTXValue ) ) / ( date.getTime() - self.lastTXDate.getTime() ) ) | 0 ;

							console.log( vb.value - self.lastTXValue, delta, "b/s" );
							//self.rates.push(  delta );
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
