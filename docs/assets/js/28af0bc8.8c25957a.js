"use strict";(self.webpackChunkdaikoku_documentation=self.webpackChunkdaikoku_documentation||[]).push([[3587],{40447:(e,t,a)=>{a.r(t),a.d(t,{assets:()=>c,contentTitle:()=>u,default:()=>k,frontMatter:()=>i,metadata:()=>r,toc:()=>d});const r=JSON.parse('{"id":"getstarted/getdaikoku/index","title":"Get Daikoku","description":"There are several ways to get Daikoku to run it on your system.","source":"@site/docs/01-getstarted/04-getdaikoku/index.mdx","sourceDirName":"01-getstarted/04-getdaikoku","slug":"/getstarted/getdaikoku/","permalink":"/daikoku/docs/getstarted/getdaikoku/","draft":false,"unlisted":false,"tags":[],"version":"current","frontMatter":{},"sidebar":"tutorialSidebar","previous":{"title":"Daikoku","permalink":"/daikoku/docs/getstarted/quickstart"},"next":{"title":"First run","permalink":"/daikoku/docs/getstarted/firstrun/"}}');var n=a(74848),o=a(28453),l=a(93859),s=a(19365);const i={},u="Get Daikoku",c={},d=[{value:"Build the documentation only",id:"build-the-documentation-only",level:2},{value:"Build the React UI",id:"build-the-react-ui",level:2},{value:"Build the Daikoku server",id:"build-the-daikoku-server",level:2}];function h(e){const t={a:"a",code:"code",h1:"h1",h2:"h2",header:"header",li:"li",p:"p",pre:"pre",ul:"ul",...(0,o.R)(),...e.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(t.header,{children:(0,n.jsx)(t.h1,{id:"get-daikoku",children:"Get Daikoku"})}),"\n",(0,n.jsx)(t.p,{children:"There are several ways to get Daikoku to run it on your system."}),"\n",(0,n.jsxs)(l.A,{children:[(0,n.jsxs)(s.A,{value:"binaries",label:"From binaries",default:!0,children:[(0,n.jsx)(t.p,{children:"If you want to download the last version of Daikoku, you can grab them from the release page of the Daikoku GitHub page:"}),(0,n.jsxs)(t.p,{children:["Go to ",(0,n.jsx)(t.a,{href:"https://github.com/MAIF/daikoku/releases",children:"https://github.com/MAIF/daikoku/releases"})," and get the last version of the ",(0,n.jsx)(t.code,{children:"daikoku-x.x.x.zip"})," file or the ",(0,n.jsx)(t.code,{children:"daikoku.jar"})," file."]})]}),(0,n.jsxs)(s.A,{value:"docker",label:"From Docker",children:[(0,n.jsx)(t.p,{children:"If you're a Docker aficionado, Daikoku is provided as a Docker image that you can pull directly from the official repos."}),(0,n.jsx)(t.p,{children:"Fetch the last Docker image of Daikoku :"}),(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-sh",children:"docker pull maif/daikoku:17.x.x\n# or \ndocker pull maif/daikoku:latest\n"})})]}),(0,n.jsxs)(s.A,{value:"sources",label:"From sources",children:[(0,n.jsx)(t.p,{children:"To build Daikoku from sources, old fashion style, you need the following tools:"}),(0,n.jsxs)(t.ul,{children:["\n",(0,n.jsx)(t.li,{children:"git"}),"\n",(0,n.jsx)(t.li,{children:"JDK 21"}),"\n",(0,n.jsx)(t.li,{children:"sbt"}),"\n",(0,n.jsx)(t.li,{children:"node"}),"\n",(0,n.jsx)(t.li,{children:"npm"}),"\n"]}),(0,n.jsxs)(t.p,{children:["Once you've installed all those tools, go to the ",(0,n.jsx)(t.a,{href:"https://github.com/MAIF/daikoku",children:"Daikoku GitHub page"})," and clone the sources:"]}),(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-sh",children:"git clone https://github.com/MAIF/daikoku.git --depth=1\n"})}),(0,n.jsxs)(t.p,{children:["then you need to run the ",(0,n.jsx)(t.code,{children:"build.sh"})," script to build the documentation, the React UI and the server:"]}),(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-sh",children:"sh ./scripts/build.sh\n"})}),(0,n.jsxs)(t.p,{children:["and that's all. You can grab your Daikoku package at ",(0,n.jsx)(t.code,{children:"daikoku/target/scala-2.13/daikoku"})," or ",(0,n.jsx)(t.code,{children:"daikoku/target/universal/"}),"."]}),(0,n.jsx)(t.p,{children:"For those who want to build only parts of Daikoku, read the following."}),(0,n.jsx)(t.h2,{id:"build-the-documentation-only",children:"Build the documentation only"}),(0,n.jsxs)(t.p,{children:["Go to the ",(0,n.jsx)(t.code,{children:"manual"})," folder and run:"]}),(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-sh",children:"npm run build\n"})}),(0,n.jsxs)(t.p,{children:["The documentation is located at ",(0,n.jsx)(t.code,{children:"manual/build"})]}),(0,n.jsx)(t.h2,{id:"build-the-react-ui",children:"Build the React UI"}),(0,n.jsxs)(t.p,{children:["Go to the ",(0,n.jsx)(t.code,{children:"daikoku/javascript"})," folder and run:"]}),(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-sh",children:"npm install\nnpm run build\n"})}),(0,n.jsxs)(t.p,{children:["You will find the JS bundle at ",(0,n.jsx)(t.code,{children:"daikoku/public/react-app/daikoku.js"}),"."]}),(0,n.jsx)(t.h2,{id:"build-the-daikoku-server",children:"Build the Daikoku server"}),(0,n.jsxs)(t.p,{children:["Go to the ",(0,n.jsx)(t.code,{children:"daikoku"})," folder and run:"]}),(0,n.jsx)(t.pre,{children:(0,n.jsx)(t.code,{className:"language-sh",children:"sbt ';clean;compile;dist;assembly'\n"})}),(0,n.jsxs)(t.p,{children:["You will find your Daikoku package at ",(0,n.jsx)(t.code,{children:"daikoku/target/scala-2.13/daikoku"})," or ",(0,n.jsx)(t.code,{children:"daikoku/target/universal/"}),"."]})]})]})]})}function k(e={}){const{wrapper:t}={...(0,o.R)(),...e.components};return t?(0,n.jsx)(t,{...e,children:(0,n.jsx)(h,{...e})}):h(e)}},19365:(e,t,a)=>{a.d(t,{A:()=>l});a(96540);var r=a(18215);const n={tabItem:"tabItem_Ymn6"};var o=a(74848);function l(e){let{children:t,hidden:a,className:l}=e;return(0,o.jsx)("div",{role:"tabpanel",className:(0,r.A)(n.tabItem,l),hidden:a,children:t})}},93859:(e,t,a)=>{a.d(t,{A:()=>y});var r=a(96540),n=a(18215),o=a(86641),l=a(56347),s=a(205),i=a(38874),u=a(24035),c=a(82993);function d(e){return r.Children.toArray(e).filter((e=>"\n"!==e)).map((e=>{if(!e||(0,r.isValidElement)(e)&&function(e){const{props:t}=e;return!!t&&"object"==typeof t&&"value"in t}(e))return e;throw new Error(`Docusaurus error: Bad <Tabs> child <${"string"==typeof e.type?e.type:e.type.name}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.`)}))?.filter(Boolean)??[]}function h(e){const{values:t,children:a}=e;return(0,r.useMemo)((()=>{const e=t??function(e){return d(e).map((e=>{let{props:{value:t,label:a,attributes:r,default:n}}=e;return{value:t,label:a,attributes:r,default:n}}))}(a);return function(e){const t=(0,u.XI)(e,((e,t)=>e.value===t.value));if(t.length>0)throw new Error(`Docusaurus error: Duplicate values "${t.map((e=>e.value)).join(", ")}" found in <Tabs>. Every value needs to be unique.`)}(e),e}),[t,a])}function k(e){let{value:t,tabValues:a}=e;return a.some((e=>e.value===t))}function p(e){let{queryString:t=!1,groupId:a}=e;const n=(0,l.W6)(),o=function(e){let{queryString:t=!1,groupId:a}=e;if("string"==typeof t)return t;if(!1===t)return null;if(!0===t&&!a)throw new Error('Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".');return a??null}({queryString:t,groupId:a});return[(0,i.aZ)(o),(0,r.useCallback)((e=>{if(!o)return;const t=new URLSearchParams(n.location.search);t.set(o,e),n.replace({...n.location,search:t.toString()})}),[o,n])]}function f(e){const{defaultValue:t,queryString:a=!1,groupId:n}=e,o=h(e),[l,i]=(0,r.useState)((()=>function(e){let{defaultValue:t,tabValues:a}=e;if(0===a.length)throw new Error("Docusaurus error: the <Tabs> component requires at least one <TabItem> children component");if(t){if(!k({value:t,tabValues:a}))throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${t}" but none of its children has the corresponding value. Available values are: ${a.map((e=>e.value)).join(", ")}. If you intend to show no default tab, use defaultValue={null} instead.`);return t}const r=a.find((e=>e.default))??a[0];if(!r)throw new Error("Unexpected error: 0 tabValues");return r.value}({defaultValue:t,tabValues:o}))),[u,d]=p({queryString:a,groupId:n}),[f,m]=function(e){let{groupId:t}=e;const a=function(e){return e?`docusaurus.tab.${e}`:null}(t),[n,o]=(0,c.Dv)(a);return[n,(0,r.useCallback)((e=>{a&&o.set(e)}),[a,o])]}({groupId:n}),b=(()=>{const e=u??f;return k({value:e,tabValues:o})?e:null})();(0,s.A)((()=>{b&&i(b)}),[b]);return{selectedValue:l,selectValue:(0,r.useCallback)((e=>{if(!k({value:e,tabValues:o}))throw new Error(`Can't select invalid tab value=${e}`);i(e),d(e),m(e)}),[d,m,o]),tabValues:o}}var m=a(92303);const b={tabList:"tabList__CuJ",tabItem:"tabItem_LNqP"};var x=a(74848);function g(e){let{className:t,block:a,selectedValue:r,selectValue:l,tabValues:s}=e;const i=[],{blockElementScrollPositionUntilNextRender:u}=(0,o.a_)(),c=e=>{const t=e.currentTarget,a=i.indexOf(t),n=s[a].value;n!==r&&(u(t),l(n))},d=e=>{let t=null;switch(e.key){case"Enter":c(e);break;case"ArrowRight":{const a=i.indexOf(e.currentTarget)+1;t=i[a]??i[0];break}case"ArrowLeft":{const a=i.indexOf(e.currentTarget)-1;t=i[a]??i[i.length-1];break}}t?.focus()};return(0,x.jsx)("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,n.A)("tabs",{"tabs--block":a},t),children:s.map((e=>{let{value:t,label:a,attributes:o}=e;return(0,x.jsx)("li",{role:"tab",tabIndex:r===t?0:-1,"aria-selected":r===t,ref:e=>i.push(e),onKeyDown:d,onClick:c,...o,className:(0,n.A)("tabs__item",b.tabItem,o?.className,{"tabs__item--active":r===t}),children:a??t},t)}))})}function j(e){let{lazy:t,children:a,selectedValue:o}=e;const l=(Array.isArray(a)?a:[a]).filter(Boolean);if(t){const e=l.find((e=>e.props.value===o));return e?(0,r.cloneElement)(e,{className:(0,n.A)("margin-top--md",e.props.className)}):null}return(0,x.jsx)("div",{className:"margin-top--md",children:l.map(((e,t)=>(0,r.cloneElement)(e,{key:t,hidden:e.props.value!==o})))})}function v(e){const t=f(e);return(0,x.jsxs)("div",{className:(0,n.A)("tabs-container",b.tabList),children:[(0,x.jsx)(g,{...t,...e}),(0,x.jsx)(j,{...t,...e})]})}function y(e){const t=(0,m.A)();return(0,x.jsx)(v,{...e,children:d(e.children)},String(t))}},28453:(e,t,a)=>{a.d(t,{R:()=>l,x:()=>s});var r=a(96540);const n={},o=r.createContext(n);function l(e){const t=r.useContext(o);return r.useMemo((function(){return"function"==typeof e?e(t):{...t,...e}}),[t,e])}function s(e){let t;return t=e.disableParentContext?"function"==typeof e.components?e.components(n):e.components||n:l(e.components),r.createElement(o.Provider,{value:t},e.children)}}}]);