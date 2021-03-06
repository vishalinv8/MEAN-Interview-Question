//1. what will be outout
var a = 1;
function b() {
    var a = 2;
    
    function c() {
      console.log(a)
    }
    
    return function() {
       var a = 3;
       c()
    }
}

var func = b();

// o/p 2
//2. what will be output
function add2(a,b){
    var ddd = function (b){return a+b;};
    if(typeof b =='undefined'){
        return ddd;
    }else{
        return ddd(b);
    }
}

add2(2)(3) // 5
add2(2,3) // 5

//3. what will be output
function add3(x) {
    return function(y) {
        if (typeof y !== 'undefined') {
            x = x + y;
            return arguments.callee;
        } else {
            return x;
        }
    };
}
add3(1)(2)(3)(); //6
add3(1)(1)(1)(1)(1)(1)(); //6