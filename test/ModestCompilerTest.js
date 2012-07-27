var assert = require('assert');
var fs = require('fs');

var vows = require('vows');
var _ = require('underscore');

var ModestCompiler = require('../ModestCompiler');
var normalize = ModestCompiler.normalize;

var compilerTopics = {
  topic : new ModestCompiler({quiet : true})
};
var setupTopics = {};
var testFiles = [];

process.chdir(__dirname);
process.chdir('compiler-test-files');

_.each(fs.readdirSync('.'), function(f){
  var baseName = f.match(/(.+)-key\.xhtml/);
  if(baseName && baseName[1])
    testFiles.push(baseName[1]);
});

_.each(testFiles,function(f){
  var testFile = f + '-pre.xhtml';
  var outFile = f + '.xhtml';
  var keyFile = f + '-key.xhtml';
  var descFile = f + '.txt';
  var topicName = 'compiling test file ' + testFile;
  
  var description;
  try{
    description = fs.readFileSync(descFile,'utf8');
    if(description)
      topicName = 'compiling ' + description;
  } catch(e){
  }
  
  setupTopics['deleting output file ' + outFile] = {
    topic : function(){
      fs.unlinkSync(outFile);
      return null;
    },
    "should result in the file being gone from the directory" : function(){
      assert(!_.contains(fs.readdirSync('.'),outFile),'file exists');
    }
  };
  compilerTopics[topicName] = {
    topic : function(mc){
      mc.compileFile(testFile,this.callback);
    },
    "should produce the expected output" : function(e){
      assert.ifError(e);
      var output = fs.readFileSync(outFile,'utf8');
      var key = ModestCompiler.normalize(fs.readFileSync(keyFile,'utf8'));
//      console.log(key);
//      console.log(output);
      assert(output == key, outFile + ' did not match ' + keyFile);
    }
  };
});

vows.describe('ModestCompiler')
.addBatch({
  "Setup: " : setupTopics
})
.addBatch({
  "ModestCompiler" : compilerTopics
})
.export(module);