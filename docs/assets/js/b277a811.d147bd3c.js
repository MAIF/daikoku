"use strict";(self.webpackChunkdaikoku_documentation=self.webpackChunkdaikoku_documentation||[]).push([[4112],{81233:(e,t,n)=>{n.r(t),n.d(t,{assets:()=>d,contentTitle:()=>r,default:()=>u,frontMatter:()=>a,metadata:()=>o,toc:()=>l});const o=JSON.parse('{"id":"usages/adminusage/importexport","title":"Import and export","description":"With Daikoku, you can easily save the current state of the instance and restore it later. Go to Settings (avatar icon) / Organizations settings and then import/export.","source":"@site/docs/02-usages/07-adminusage/4-importexport.md","sourceDirName":"02-usages/07-adminusage","slug":"/usages/adminusage/importexport","permalink":"/daikoku/docs/usages/adminusage/importexport","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":4,"frontMatter":{},"sidebar":"tutorialSidebar","previous":{"title":"Managing sessions","permalink":"/daikoku/docs/usages/adminusage/sessions"},"next":{"title":"Using Daikoku as Tenant admin","permalink":"/daikoku/docs/usages/tenantusage/"}}');var i=n(74848),s=n(28453);const a={},r="Import and export",d={},l=[{value:"Full export",id:"full-export",level:2},{value:"Full import",id:"full-import",level:2},{value:"Database migration",id:"database-migration",level:2}];function c(e){const t={admonition:"admonition",blockquote:"blockquote",code:"code",h1:"h1",h2:"h2",header:"header",li:"li",ol:"ol",p:"p",strong:"strong",...(0,s.R)(),...e.components};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(t.header,{children:(0,i.jsx)(t.h1,{id:"import-and-export",children:"Import and export"})}),"\n",(0,i.jsxs)(t.p,{children:["With Daikoku, you can easily save the current state of the instance and restore it later. Go to ",(0,i.jsx)(t.code,{children:"Settings (avatar icon) / Organizations settings"})," and then ",(0,i.jsx)(t.code,{children:"import/export"}),"."]}),"\n",(0,i.jsx)(t.h2,{id:"full-export",children:"Full export"}),"\n",(0,i.jsxs)(t.p,{children:["Click on the ",(0,i.jsx)(t.code,{children:"download state"})," button."]}),"\n",(0,i.jsx)(t.p,{children:"Your browser will start downloading a ndjson file containing the internal state of your Daikoku instance."}),"\n",(0,i.jsxs)(t.blockquote,{children:["\n",(0,i.jsxs)(t.p,{children:["Audit trail store could be massive, you can exclude this collection from export by toggle the button below the ",(0,i.jsx)(t.code,{children:"download state"})," button."]}),"\n"]}),"\n",(0,i.jsx)(t.h2,{id:"full-import",children:"Full import"}),"\n",(0,i.jsxs)(t.p,{children:["If you want to restore an export, Go to ",(0,i.jsx)(t.code,{children:"settings (avatar icon) / Organizations settings"})," and then ",(0,i.jsx)(t.code,{children:"import/export"}),".  Click on the ",(0,i.jsx)(t.code,{children:"import state"})," button and choose your ndjson export file."]}),"\n",(0,i.jsx)(t.h2,{id:"database-migration",children:"Database migration"}),"\n",(0,i.jsx)(t.p,{children:"Since v1.1.1 Daikoku supports Postgresql databases. If you want to migrate you MongoDB to Postgresql, it's dead simple like the following instructions."}),"\n",(0,i.jsx)(t.admonition,{type:"danger",children:(0,i.jsxs)(t.p,{children:["Since ",(0,i.jsx)(t.strong,{children:"v18.0.0"}),", Daikoku does not support MongoDB anymore. To run database migration, you need to be in ",(0,i.jsx)(t.strong,{children:"16.3.6 max"}),"."]})}),"\n",(0,i.jsxs)(t.ol,{children:["\n",(0,i.jsx)(t.li,{children:"Add your Postgresql access in Daikoku configuration"}),"\n",(0,i.jsx)(t.li,{children:"Keep mongo as daikoku.storage configuration"}),"\n",(0,i.jsx)(t.li,{children:"Run the migration"}),"\n",(0,i.jsx)(t.li,{children:"Update your daikoku.storage to postgres"}),"\n",(0,i.jsx)(t.li,{children:"Restart your Daikoku"}),"\n",(0,i.jsx)(t.li,{children:"Remember to disable the maintenance mode"}),"\n"]})]})}function u(e={}){const{wrapper:t}={...(0,s.R)(),...e.components};return t?(0,i.jsx)(t,{...e,children:(0,i.jsx)(c,{...e})}):c(e)}},28453:(e,t,n)=>{n.d(t,{R:()=>a,x:()=>r});var o=n(96540);const i={},s=o.createContext(i);function a(e){const t=o.useContext(s);return o.useMemo((function(){return"function"==typeof e?e(t):{...t,...e}}),[t,e])}function r(e){let t;return t=e.disableParentContext?"function"==typeof e.components?e.components(i):e.components||i:a(e.components),o.createElement(s.Provider,{value:t},e.children)}}}]);