const base=require('./karma.conf.js');module.exports=config=>{base(config);config.set({port:9882,reporters:['progress'],singleRun:true,autoWatch:false});};
