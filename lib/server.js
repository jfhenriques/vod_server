
var snmp = require('snmp-native');



var Server = exports = module.exports = function()
{
	if( !(this instanceof Server) )
		return new Server();

	this.name = undefined;
	this.ip = undefined;
	this.inf = undefined;

	this.community = undefined;

	this.snmpConn = undefined;
}



Server.New = function(name, ip, inf, community)
{
	var s = new Server();

	if( name )
		s.name = name;

	if( ip )
		s.ip = ip;

	s.inf = ( !!inf ) ? inf : "eth0";

	s.community = ( !!community ) ? community : "public";

	return s;
};

Server.deserialize = function(obj)
{
	return ( !!obj )
			? Server.New( obj.name, obj.ip, obj.inf, obj.community )
			: new Server();
}

Server.prototype.isValid = function()
{
	return !!this.ip ;
}


Server.prototype.createConnection = function(callback)
{
	if(    !this.snmpConn
		&& this.isValid() )
	{
		process.nextTick(function(){

			var conn = new snmp.Session({ host: this.ip, community: this.community });
			this.snmpConn = conn;

			if( callback )
				callback(undefined);
			
		}.bind(this));
	}
}


