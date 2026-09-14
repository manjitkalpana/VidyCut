import type { Clip } from "../projects/schema";
import { rgb } from "../chroma-key/engine";
const vertex = `attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.0)/2.0;gl_Position=vec4(p.x,-p.y,0.,1.);}`;
const fragment = `precision mediump float;varying vec2 uv;uniform sampler2D tex;uniform vec2 size;uniform float time;uniform vec4 grade1;uniform vec4 grade2;uniform vec4 grade3;uniform vec4 grade4;uniform vec4 fx1;uniform vec4 fx2;uniform vec4 fx3;uniform vec4 chroma;uniform vec3 key;uniform float spill;float rand(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+floor(time*30.))*43758.5453);}void main(){vec2 pos=uv;float grain=fx1.x;float pixels=fx1.y;float wave=fx1.z;float ripple=fx1.w;if(pixels>0.){float n=3.+pixels*90.;pos=floor(pos*size/n)*n/size;}pos.x+=sin(pos.y*25.+time*4.)*wave*.025;vec2 d=pos-.5;pos+=normalize(d+vec2(.00001))*sin(length(d)*50.-time*5.)*ripple*.015;pos+=d*dot(d,d)*fx3.w*.5;vec4 c=texture2D(tex,pos);if(fx2.x>0.){float shift=fx2.x*.025;c.r=texture2D(tex,pos+vec2(shift,0)).r;c.b=texture2D(tex,pos-vec2(shift,0)).b;}if(fx2.y>0.){float row=floor(pos.y*24.);float shift=(rand(vec2(row,0))-.5)*fx2.y*.13;if(rand(vec2(row,1))>.7)c=texture2D(tex,pos+vec2(shift,0.));}if(fx2.z>0.)c.rgb*=1.-fx2.z*.15*(.5+.5*sin(pos.y*size.y*2.));if(fx2.w>0.){vec2 t=1./size;vec3 around=texture2D(tex,pos+vec2(t.x,0)).rgb+texture2D(tex,pos-vec2(t.x,0)).rgb+texture2D(tex,pos+vec2(0,t.y)).rgb+texture2D(tex,pos-vec2(0,t.y)).rgb;c.rgb+=(c.rgb*4.-around)*fx2.w;}if(fx3.x>0.){vec2 t=vec2(3./size.x,3./size.y);vec3 blur=(texture2D(tex,pos+t).rgb+texture2D(tex,pos-t).rgb+texture2D(tex,pos+vec2(t.x,-t.y)).rgb+texture2D(tex,pos+vec2(-t.x,t.y)).rgb)*.25;c.rgb+=max(vec3(0),blur-.5)*fx3.x*1.5;}if(fx3.y>0.){vec3 edge=abs(c.rgb-texture2D(tex,pos+2./size).rgb)*7.;c.rgb=mix(c.rgb,edge*vec3(.3,1.,.8),fx3.y);}if(fx3.z>0.)c.rgb=mix(c.rgb,(c.rgb+texture2D(tex,pos-vec2(.02*fx3.z,0)).rgb+texture2D(tex,pos-vec2(.04*fx3.z,0)).rgb)/3.,fx3.z);if(chroma.x>0.){float dist=distance(c.rgb,key)/1.732;c.a*=smoothstep(chroma.y,chroma.y+max(.001,chroma.z),dist);if(key.g>key.r&&key.g>key.b)c.g-=max(0.,c.g-max(c.r,c.b))*spill*(1.-c.a*.5);}c.rgb*=pow(2.,grade1.x);c.rgb+=grade1.y;c.rgb=(c.rgb-.5)*(1.+grade1.z)+.5;float lum=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(lum),c.rgb,1.+grade1.w);c.rgb+=vec3(grade2.x*.14,grade2.y*.1,-grade2.x*.14);c.rgb+=grade2.z*pow(1.-clamp(lum,0.,1.),2.)*.35;c.rgb+=grade2.w*pow(clamp(lum,0.,1.),2.)*.35;c.rgb+=grade3.x*pow(clamp(lum,0.,1.),4.)*.3;c.rgb+=grade3.y*pow(1.-clamp(lum,0.,1.),4.)*.3;c.rgb=mix(c.rgb,vec3(.2)+c.rgb*.7,grade3.z);c.rgb=pow(max(c.rgb,vec3(0)),max(vec3(.1),vec3(1.)-grade4.xyz));float hue=grade4.w*3.14159;vec3 axis=normalize(vec3(1));c.rgb=c.rgb*cos(hue)+cross(axis,c.rgb)*sin(hue)+axis*dot(axis,c.rgb)*(1.-cos(hue));c.rgb+=(rand(pos)-.5)*grain*.3;c.rgb*=1.-smoothstep(.2,.72,distance(uv,vec2(.5)))*grade3.w;gl_FragColor=vec4(clamp(c.rgb,0.,1.),c.a);}`;
export class GpuPipeline {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | null;
  program: WebGLProgram | null = null;
  texture: WebGLTexture | null = null;
  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      alpha: true,
    });
    const gl = this.gl;
    if (!gl) return;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        throw new Error("GPU processing is not supported.");
      }
      return s;
    };
    try {
      const program = gl.createProgram()!;
      const vs = shader(gl.VERTEX_SHADER, vertex),
        fs = shader(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error("GPU unavailable");
      this.program = program;
      gl.useProgram(program);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const loc = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch {
      this.gl = null;
    }
  }
  process(source: HTMLCanvasElement, c: Clip, time: number) {
    const gl = this.gl,
      program = this.program;
    if (!gl || !program) {
      if (
        c.chroma.enabled ||
        Object.values(c.grade).some(Boolean) ||
        c.effects.some((e) => e.enabled && e.amount > 0)
      )
        throw new Error(
          "Your browser cannot run GPU effects. Enable hardware acceleration.",
        );
      return source;
    }
    this.canvas.width = source.width;
    this.canvas.height = source.height;
    gl.viewport(0, 0, source.width, source.height);
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const u = (n: string) => gl.getUniformLocation(program, n);
    const fx = (...types: string[]) =>
      c.effects
        .filter((e) => e.enabled && types.includes(e.type))
        .reduce((a, b) => Math.max(a, b.amount), 0);
    const g = c.grade;
    gl.uniform2f(u("size"), source.width, source.height);
    gl.uniform1f(u("time"), time);
    gl.uniform4f(
      u("grade1"),
      (g.exposure ?? 0) + fx("exposure") * 2,
      (g.brightness ?? 0) + fx("brightness") * 0.3,
      (g.contrast ?? 0) + fx("contrast"),
      (g.saturation ?? 0) + fx("saturation"),
    );
    gl.uniform4f(
      u("grade2"),
      g.temperature ?? 0,
      g.tint ?? 0,
      g.shadows ?? 0,
      g.highlights ?? 0,
    );
    gl.uniform4f(
      u("grade3"),
      g.whites ?? 0,
      g.blacks ?? 0,
      g.fade ?? 0,
      (g.vignette ?? 0) + fx("vignette"),
    );
    gl.uniform4f(
      u("grade4"),
      g.curveR ?? 0,
      g.curveG ?? 0,
      g.curveB ?? 0,
      g.hue ?? 0,
    );
    gl.uniform4f(
      u("fx1"),
      fx("grain", "noise", "film"),
      fx("pixelate", "mosaic"),
      fx("wave"),
      fx("ripple"),
    );
    gl.uniform4f(
      u("fx2"),
      fx("rgb", "aberration"),
      fx("glitch"),
      fx("vhs"),
      Math.max(fx("sharpen"), g.sharpen ?? 0),
    );
    gl.uniform4f(
      u("fx3"),
      fx("glow"),
      fx("neon"),
      fx("motionBlur"),
      fx("distortion"),
    );
    gl.uniform4f(
      u("chroma"),
      c.chroma.enabled ? 1 : 0,
      c.chroma.tolerance,
      c.chroma.softness,
      0,
    );
    const key = rgb(c.chroma.color);
    gl.uniform3f(u("key"), key[0] / 255, key[1] / 255, key[2] / 255);
    gl.uniform1f(u("spill"), c.chroma.spill);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }
  dispose() {
    const gl = this.gl;
    if (gl && this.program) gl.deleteProgram(this.program);
    if (gl && this.texture) gl.deleteTexture(this.texture);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
