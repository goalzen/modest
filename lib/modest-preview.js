modest = this.modest || {
  modules : {}, // compiled modules as strings
  //#REMOVE-POST-COMPILE
  $uncompiled : {}, // uncompiled modules as jquery objects
  compiled : {}, // set {X:X} -- names of modules that have been compiled
  saveAsJs : {}, // set {X:X} -- names of modules needed for js
  setWindow : function(w){
    window = w;
    document = w.document;
    if(w.$) $ = w.$;
    modest.nodejs = true;
  },
  reset : function(){
    modest.modules = {};
    modest.$uncompiled = {};
    modest.compiled = {};
    modest.saveAsJs = {};
  },
  loadModules : function(){
    var includes = document.getElementsByTagName('include');
    var path, pathAttr, moduleName, moduleContent, i;

    for(i = 0; i < includes.length; ++i){
     
      // Assume the include tag has a single text node with the name of the module
      
      moduleName = includes[i].childNodes[0].nodeValue;
      
      // Remove leading and trailing whitespace from the module name
      
      moduleName = moduleName.replace(/^\s+/, '').replace(/\s+$/, '');
      
      if(!modest.compiled[moduleName]){
        path = '';
        pathAttr = includes[i].getAttribute('path');      
        if(pathAttr){

          // Remove trailing slashes and whitespace from the "path" attribute; Add one slash

          path = pathAttr.replace(/[\/\\\s]+$/,'') + '/';
        }
        
        path += moduleName;

        // Append ".xml" if the path doesn't already end with it

        path = path.replace(/\.xml$/,'') + '.xml'; 
        moduleContent = modest.localFile(path);
        modest.$uncompiled[moduleName] = $(moduleContent);
      }
      
      if(includes[i].hasAttribute('client')){
        modest.saveAsJs[moduleName] = moduleName;
      }

      includes[i].parentNode.removeChild(includes[i]);
    }
    
  },
  compileModules : function(){
    var dependencies = {};
    var compiledCount = 0;
    var numModules = 0;
    var waitToCompile, module, otherModule, lastCompiledCount, d;

    function loopError(){
      var badModules = '';
      var module;
      
      for (module in modest.$uncompiled){       
        if(!modest.compiled[module])
          badModules += module + ' ';       
      }
      
      throw ('Infinite loop detected in modules: ' + badModules);
    }

    function compileModule(module){
      var $module = modest.$uncompiled[module];
      modest.compileNode($module, dependencies[module]);
      if($module[0].outerHTML)
        modest.modules[module] = $module[0].outerHTML;
      else{
        if(this.XMLSerializer)
          modest.modules[module] = new XMLSerializer().serializeToString($module[0]);
      }  
      modest.$uncompiled[module] = false;
      modest.compiled[module] = module;
    }

    for (module in modest.$uncompiled){
      ++numModules;
      if(!modest.compiled[module]){ 
        dependencies[module] = [];

        for (otherModule in modest.$uncompiled){        
          if(modest.$uncompiled[module].find(otherModule).length)
            dependencies[module].push(otherModule);         
        }

      }
    }
    
    while(compiledCount < numModules){   
      lastCompiledCount = compiledCount;
      
      for (module in modest.$uncompiled){         
        if(modest.compiled[module]){
          ++compiledCount;
          continue;
        }    
        waitToCompile = false;

        for (d in dependencies[module]){       
          if(!modest.compiled[dependencies[module][d]]){
            waitToCompile = true;
            break;
          }           
        }
        
        if(!waitToCompile){
          compileModule(module);
          ++compiledCount;
        }      
      }
      
      if(lastCompiledCount === compiledCount)
        loopError();  
    }
    
  },
  compileNode : function($node, modules){
    if(!modules)
      modules = modest.compiled;
    
    // find and compile module views within the node
    
    $.each(modules, function(i,module){ 
      $node.find(module).each(function(){
        modest.compileView($(this),module);
      });   
    });  
    
  },
  //#!REMOVE-POST-COMPILE
  getAttributes : function(el){
    var attrs = {};
    $.each(el.attributes, function(i,attr){
      attrs[attr.name] = attr.value;
    });
    return attrs;
  },
  localFile : function (path){
    if(modest.nodejs)
      return fs.readFileSync(path,'utf8');
    else
      return modest.remoteFile(path);
  },
  remoteFile : function (path){
    $.support.cors = true;
      return $.ajax({
        url: path,
        async : false
      }).responseText;
  },
  data : function (path){
    // Supported data formats: JSON
    return $.parseJSON(modest.localFile(path));
  },
  remoteData : function(path){
    // Supported data formats: JSON
    return $.parseJSON(modest.remoteFile(path));
  },
  compileView : function($view,module,parameters){   
    var params = {};
    var paramAttrs = {};
    var viewAttrs, $targets;
    
    // Get parameters in the following order:
    // (in case of duplicates, later overwrites earlier)
    // 1. remote data
    // 2. local data
    // 3. js parameters
    // 4. html parameters
    
    if($view.attr('remotedata')){
      $.each($view.attr('remotedata').toLowerCase().split(' '),function(){
        $.extend(params,modest.remoteData(this));
      });
      $view.removeAttr('remotedata');
    }
    
    if($view.attr('data')){
      $.each($view.attr('data').toLowerCase().split(' '),function(){
        $.extend(params,modest.data(this));
      });
      $view.removeAttr('data');
    }
    
    $.extend(params,parameters);
    
    // html parameters
    
    $view.children().each(function(){
      var param = this;   
      var tag = param.tagName.toLowerCase();  
      paramAttrs[tag] = modest.getAttributes(param);
      if(param.innerText && !param.children.length)
        params[tag] = param.innerText;
      else
        params[tag] = param.innerHTML;
    });
    
    // save the views attributes
    
    viewAttrs = modest.getAttributes($view[0]);
    
    // replace the view with the module
    
    $view.html(modest.modules[module]);
    $view = $view.children(':first').unwrap();
    $view.attr(viewAttrs);
    $view.addClass(module);
    
    // find targets for the parameters
    
    $targets = $view.find('[uses]').not('[uses=""]');
    
    // handle parameter targets in the root element
    
    if($view.attr('uses'))
      $targets = $view.add($targets);
    
    // inject the parameters
    
    $targets.each(function(){
      var $target = $(this);
      var uses = $target.attr('uses').toLowerCase().split(' ');
      var eq, param, u, attr;

      for(u = 0; u < uses.length; ++u){
        switch(uses[u][0]){
        case '+':
          if(params[uses[u].slice(1)]===undefined){
            $target.remove();
            break;
          }
          break;
        case '-':
          if(params[uses[u].slice(1)]!==undefined){
            $target.remove();
            break;
          }
          break;
        default:
          eq = uses[u].indexOf('=');
          if(eq !== -1){
            attr = uses[u].slice(0,eq);
            param = uses[u].slice(eq+1);
            if(params[param])
              $target.attr(attr,params[param]);
          }
          else {
            if(params[uses[u]]===undefined){
              $target.remove();
              break;
            }
            else {
              $target.attr(paramAttrs[uses[u]] || {});
              $target.html(params[uses[u]]);
              $target.addClass(uses[u]);         
            } 
          }  
        }
      }
    });
    
  },
  render : function(module,parameters){
    var $view = $('<div>');
    modest.compileView($view, module, parameters);
    $view.find('[uses]').not('[uses=""]').removeAttr('uses');
    return $view.children(':first')[0].outerHTML;
  }
};
//#REMOVE-POST-COMPILE
if(this.window){
  $(function(){
    modest.loadModules();
    modest.compileModules();
    modest.compileNode($(document.body));
  });
}
//#!REMOVE-POST-COMPILE