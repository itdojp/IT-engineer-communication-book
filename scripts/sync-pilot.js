#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path');
const root=path.resolve(__dirname,'..'); const manifest=JSON.parse(fs.readFileSync(path.join(root,'src/canonical-pilot.json'),'utf8'));
const write=process.argv.includes('--write'); const differences=[];
for(const rel of manifest.files){const src=path.join(root,manifest.canonical_root,rel);const out=path.join(root,manifest.generated_root,rel);const content=fs.readFileSync(src);const current=fs.existsSync(out)?fs.readFileSync(out):null;if(!current||!content.equals(current)){differences.push(rel);if(write){fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,content);}}}
if(differences.length){console.log(`${write?'synchronized':'drift detected'}: ${differences.join(', ')}`);if(!write)process.exit(1);}else console.log('canonical pilot is synchronized');
