const base=require('./karma.conf.js');
module.exports=function(config){const original=config.set.bind(config);config.set=options=>original({...options,files:[...(options.files||[]),{pattern:'src/app/pages/settings-new/settings-new-connections.scss',included:false,served:true,watched:false}]});base(config);};
