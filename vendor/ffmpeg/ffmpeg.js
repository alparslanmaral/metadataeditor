// UMD wrapper for @ffmpeg/ffmpeg
(function(factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['exports'], factory);
    } else if (typeof exports === 'object') {
        // Node.js
        factory(exports);
    } else {
        // Browser globals
        factory((this.ffmpeg = {}));
    }
})(function(exports) {
    // ffmpeg.js code...
    // This should include the actual code from @ffmpeg/ffmpeg dist/umd/ffmpeg.js
});