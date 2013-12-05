

 exports = module.exports = {

 	parseInteger: function(value, def, min)
	{
		if( value === undefined )
			return def;

		if( min === undefined )
			min = 0 ;

		var out = parseInt( value );

		return ( isNaN( out ) || out < min )
					? def
					: out ;
	},

	parseFloatNumber: function(value, def, min)
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
}
