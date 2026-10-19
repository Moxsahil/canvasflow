import desmosIcon from '../assets/site-icons/desmos.png';
import { cn } from '@/lib/utils';

/**
 * Each site's own icon, shown beside its name once a pasted link is
 * recognised, so the field says which site at a glance.
 *
 * The vector icons are from theSVG (https://github.com/glincker/thesvg),
 * MIT licensed — see assets/site-icons/LICENSE-thesvg.txt — and the Desmos
 * one is the app icon desmos.com serves. Each brand's icon is its owner's.
 * A one-colour mark is drawn in the text colour, so it reads in both themes.
 */
const VECTOR_ICONS: Readonly<Record<string, { readonly viewBox: string; readonly body: string }>> =
  {
    youtube: {
      viewBox: '0 0 256 180',
      body: '<path fill="red" d="M250.346 28.075A32.18 32.18 0 0 0 227.69 5.418C207.824 0 127.87 0 127.87 0S47.912.164 28.046 5.582A32.18 32.18 0 0 0 5.39 28.24c-6.009 35.298-8.34 89.084.165 122.97a32.18 32.18 0 0 0 22.656 22.657c19.866 5.418 99.822 5.418 99.822 5.418s79.955 0 99.82-5.418a32.18 32.18 0 0 0 22.657-22.657c6.338-35.348 8.291-89.1-.164-123.134Z"/><path fill="#fff" d="m102.421 128.06l66.328-38.418l-66.328-38.418z"/>',
    },
    vimeo: {
      viewBox: '0 0 24 24',
      body: '<path fill="#1ab7ea" d="M23.977 6.417c-.105 2.338-1.74 5.543-4.894 9.609c-3.268 4.247-6.026 6.37-8.29 6.37c-1.41 0-2.578-1.294-3.553-3.881L5.322 11.4Q4.244 7.524 3.01 7.523q-.27 0-1.881 1.132l-1.13-1.457A315 315 0 0 0 3.502 4.07C5.08 2.702 6.266 1.985 7.055 1.91q2.8-.27 3.447 3.839q.698 4.43.97 5.507q.81 3.675 1.777 3.674q.752 0 2.265-2.385q1.505-2.383 1.612-3.628c.144-1.371-.395-2.061-1.614-2.061c-.574 0-1.167.12-1.777.39C14.92 3.38 17.169 1.49 20.497 1.61c2.473.06 3.628 1.664 3.493 4.797z"/>',
    },
    loom: {
      viewBox: '0 0 256 256',
      body: '<path fill="#625df5" d="M256 113.765h-74.858l64.83-37.43l-14.237-24.667l-64.83 37.43l37.421-64.825l-24.667-14.246l-37.421 64.826V0h-28.476v74.86L76.326 10.027L51.667 24.266L89.096 89.09L24.265 51.668l-14.238 24.66l64.83 37.43H0v28.477h74.85l-64.823 37.43l14.238 24.667l64.824-37.423l-37.43 64.825l24.667 14.239l37.429-64.832V256h28.476v-74.853l37.422 64.826l24.665-14.239l-37.428-64.832l64.83 37.43l14.24-24.667l-64.825-37.423h74.85v-28.477zM128 166.73c-21.472 0-38.876-17.403-38.876-38.876S106.528 88.978 128 88.978s38.875 17.404 38.875 38.876c0 21.473-17.403 38.876-38.875 38.876"/>',
    },
    figma: {
      viewBox: '0 0 54 80',
      body: '<g fill="none"><g clip-path="url(#SVGDSYAXqcP)"><path fill="#0acf83" d="M13.333 80c7.36 0 13.334-5.973 13.334-13.333V53.334H13.333C5.973 53.334 0 59.307 0 66.667S5.973 80 13.333 80"/><path fill="#a259ff" d="M0 40c0-7.36 5.973-13.333 13.333-13.333h13.334v26.666H13.333C5.973 53.333 0 47.36 0 40"/><path fill="#f24e1e" d="M0 13.333C0 5.973 5.973 0 13.333 0h13.334v26.667H13.333C5.973 26.667 0 20.693 0 13.333"/><path fill="#ff7262" d="M26.667 0H40c7.36 0 13.333 5.973 13.333 13.333S47.36 26.667 40 26.667H26.667z"/><path fill="#1abcfe" d="M53.333 40c0 7.36-5.973 13.333-13.333 13.333S26.667 47.36 26.667 40S32.64 26.667 40 26.667S53.333 32.64 53.333 40"/></g><defs><clipPath id="SVGDSYAXqcP"><path fill="#fff" d="M0 0h53.333v80H0z"/></clipPath></defs></g>',
    },
    'google-docs': {
      viewBox: '0 0 192 192',
      body: '<mask id="SVGCV6DEeJR" width="128" height="176" x="32" y="8" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#3186ff" d="M130.334 184H61.6c-8.943 0-13.415 0-16.962-1.404a20 20 0 0 1-11.233-11.234C32 167.815 32 163.343 32 154.4V37.6c0-8.943 0-13.415 1.404-16.963A20 20 0 0 1 44.639 9.404C48.185 8 52.657 8 61.6 8H100l54.793 54.793c1.661 1.661 2.492 2.492 3.13 3.43a12 12 0 0 1 1.862 4.502c.212 1.115.212 2.301.21 4.674c-.035 48.918-.057 49.4-.058 78.967c0 8.966 0 13.45-1.405 16.997a20 20 0 0 1-11.233 11.233C143.752 184 139.279 184 130.334 184"/></mask><g fill="none"><g mask="url(#SVGCV6DEeJR)"><path fill="#3186ff" d="M159.94 184H32V8h68l59.999 60z"/><g filter="url(#SVGqbD8luoH)"><path fill="url(#SVGWeNIEeIi)" d="M43 192h106V20H43z"/></g></g><path fill="#76bbff" d="M154.995 62.995A14.93 14.93 0 0 0 146 60h-33.2c-7.069 0-12.8-5.73-12.8-12.8V8z"/><rect width="64" height="12" x="64.001" y="114" fill="#fff" rx="6"/><rect width="48" height="12" x="64.001" y="143" fill="#fff" rx="6"/><defs><linearGradient id="SVGWeNIEeIi" x1="96" x2="54.612" y1="59.284" y2="171.338" gradientUnits="userSpaceOnUse"><stop offset=".33" stop-color="#3186ff"/><stop offset="1" stop-color="#a9a8ff"/></linearGradient><filter id="SVGqbD8luoH" width="130" height="196" x="31" y="8" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_37242_8762" stdDeviation="6"/></filter></defs></g>',
    },
    'google-sheets': {
      viewBox: '0 0 192 192',
      body: '<mask id="SVGTLOQIdVO" width="160" height="128" x="24" y="32" maskUnits="userSpaceOnUse" style="mask-type:alpha"><rect width="160" height="128" x="24" y="32" fill="#0ebc5f" rx="20"/></mask><g fill="none"><path fill="#009954" d="M8 74.6c0-8.943 0-13.415 1.404-16.962a20 20 0 0 1 11.234-11.233C24.185 45 28.656 45 37.6 45h60.8c8.943 0 13.415 0 16.962 1.404a20 20 0 0 1 11.234 11.234C128 61.185 128 65.656 128 74.6v42.8c0 8.943 0 13.415-1.404 16.962a20 20 0 0 1-11.234 11.234C111.815 147 107.343 147 98.4 147H37.6c-8.943 0-13.415 0-16.963-1.404a20 20 0 0 1-11.233-11.234C8 130.815 8 126.343 8 117.4z"/><g mask="url(#SVGTLOQIdVO)"><path fill="#0ebc5f" d="M24 32h160v128H24z"/><g filter="url(#SVGodDJ2d0E)"><rect width="144" height="102" fill="url(#SVGMhy32cKl)" rx="25.6" transform="matrix(1 0 0 -1 8 147)"/></g></g><path stroke="#fff" stroke-linecap="round" stroke-width="12" d="M80 121h84m-20 19V76"/><defs><linearGradient id="SVGMhy32cKl" x1="122.24" x2="20.76" y1="43.31" y2="43.31" gradientUnits="userSpaceOnUse"><stop stop-color="#0ebc5f"/><stop offset=".95" stop-color="#78c9ff"/></linearGradient><filter id="SVGodDJ2d0E" width="168" height="126" x="-4" y="33" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_37435_8174" stdDeviation="6"/></filter></defs></g>',
    },
    'google-slides': {
      viewBox: '0 0 192 192',
      body: '<mask id="SVGn722rcBs" width="168" height="128" x="12" y="32" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#fec700" d="M12 61.6c0-8.943 0-13.415 1.405-16.962a20 20 0 0 1 11.233-11.233C28.185 32 32.656 32 41.6 32h108.8c8.943 0 13.415 0 16.962 1.404a20 20 0 0 1 11.234 11.234C180 48.185 180 52.657 180 61.6v68.8c0 8.943 0 13.415-1.404 16.962a20 20 0 0 1-11.234 11.234C163.815 160 159.343 160 150.4 160H41.6c-8.943 0-13.415 0-16.963-1.404a20 20 0 0 1-11.232-11.234C12 143.815 12 139.343 12 130.4z"/></mask><g fill="none"><path fill="url(#SVGXOhOlbZm)" d="M12.591 63.318c-2.493-15.262 7.858-29.655 23.12-32.148l96.724-15.8c15.262-2.492 29.655 7.859 32.148 23.12l14.732 90.189c2.493 15.262-7.858 29.655-23.12 32.148l-96.724 15.8c-15.262 2.493-29.655-7.858-32.148-23.12z"/><path fill="url(#SVGRoDrS3Ye)" d="M12 61.6c0-8.943 0-13.415 1.405-16.962a20 20 0 0 1 11.233-11.233C28.185 32 32.656 32 41.6 32h108.8c8.943 0 13.415 0 16.962 1.404a20 20 0 0 1 11.234 11.234C180 48.185 180 52.657 180 61.6v68.8c0 8.943 0 13.415-1.404 16.962a20 20 0 0 1-11.234 11.234C163.815 160 159.343 160 150.4 160H41.6c-8.943 0-13.415 0-16.963-1.404a20 20 0 0 1-11.232-11.234C12 143.815 12 139.343 12 130.4z"/><g filter="url(#SVGRbHZbd3y)" mask="url(#SVGn722rcBs)"><path fill="#ffbe00" d="m33.74 191.516l144.396-21.58L153.304 3.781L8.907 25.361z"/><path fill="url(#SVGFlUn4bga)" d="m33.74 191.516l144.396-21.58L153.304 3.781L8.907 25.361z"/></g><path fill="#fff" fill-rule="evenodd" d="M148 58a6 6 0 0 1 6 6v64a6 6 0 0 1-6 6H44l-.309-.008A6 6 0 0 1 38 128V64a6 6 0 0 1 5.691-5.992L44 58zm-98 64h92V70H50z" clip-rule="evenodd"/><defs><linearGradient id="SVGXOhOlbZm" x1="84.07" x2="157.2" y1="23.27" y2="160.82" gradientUnits="userSpaceOnUse"><stop offset=".2" stop-color="#ffdb0f"/><stop offset=".67" stop-color="#ffbe00"/><stop offset=".91" stop-color="#ffa8e3"/></linearGradient><linearGradient id="SVGRoDrS3Ye" x1="96" x2="96" y1="32" y2="160" gradientUnits="userSpaceOnUse"><stop stop-color="#ffbe00"/><stop offset="1" stop-color="#fec700"/></linearGradient><linearGradient id="SVGFlUn4bga" x1="108.52" x2="83.96" y1="168.16" y2="25.27" gradientUnits="userSpaceOnUse"><stop offset=".07" stop-color="#fff549"/><stop offset=".78" stop-color="#ffbe00" stop-opacity="0"/></linearGradient><filter id="SVGRbHZbd3y" width="193.23" height="211.73" x="-3.09" y="-8.22" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_37552_9023" stdDeviation="6"/></filter></defs></g>',
    },
    'google-forms': {
      viewBox: '0 0 192 192',
      body: '<mask id="SVGZXzI4cEY" width="102" height="50" x="70" y="21" maskUnits="userSpaceOnUse" style="mask-type:alpha"><rect width="102" height="50" x="70" y="21" fill="#5f54f4" rx="25"/></mask><g fill="none"><rect width="102" height="50" x="70" y="121" fill="#969dff" rx="25"/><rect width="50" height="50" x="20" y="121" fill="#b8c0ff" rx="25"/><rect width="50" height="50" x="20" y="71" fill="#5746e3" rx="25"/><rect width="102" height="50" x="70" y="71" fill="#5746e3" rx="25"/><g mask="url(#SVGZXzI4cEY)"><rect width="102" height="50" x="70" y="21" fill="#7372fe" rx="25"/><g filter="url(#SVGywokKbnF)"><circle cx="56" cy="46" r="36" fill="#64afff"/></g></g><rect width="50" height="50" x="20" y="21" fill="#7372fe" rx="25"/><path stroke="#fff" stroke-linecap="round" stroke-width="12" d="M95 46h52"/><circle cx="45" cy="46" r="12" fill="#fff"/><defs><filter id="SVGywokKbnF" width="111.47" height="111.47" x=".27" y="-9.74" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_37586_9489" stdDeviation="9.87"/></filter></defs></g>',
    },
    'google-drive': {
      viewBox: '0 0 192 192',
      body: '<mask id="SVGgCHmrbFN" width="168" height="154" x="12" y="18" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#b43333" d="M63.09 37c14.626-25.333 51.193-25.334 65.819 0l45.033 78c14.626 25.334-3.657 57.001-32.91 57.001H50.967c-29.253 0-47.536-31.667-32.91-57.001z"/></mask><g fill="none"><g mask="url(#SVGgCHmrbFN)"><path fill="url(#SVGlW9cjeVu)" d="M206.905 172.02h-91.888l-19.015-32.934l45.944-79.578z"/><path fill="url(#SVG8MKVFbNJ)" d="M-14.919 172.006L50.04 59.494v.002L31.032 92.422h38.02L115 172.004l-129.918.001z"/><path fill="url(#SVGPGjVKcCp)" d="M96.007-20.085L141.954 59.5l-19.011 32.928H31.048z"/></g><defs><linearGradient id="SVGlW9cjeVu" x1="193.6" x2="103.09" y1="165.6" y2="111.21" gradientUnits="userSpaceOnUse"><stop offset=".09" stop-color="#ffe921"/><stop offset="1" stop-color="#fec700"/></linearGradient><linearGradient id="SVG8MKVFbNJ" x1="114.4" x2="15.53" y1="181.61" y2="121.8" gradientUnits="userSpaceOnUse"><stop offset=".15" stop-color="#a9a8ff"/><stop offset=".33" stop-color="#6d97ff"/><stop offset=".48" stop-color="#3186ff"/></linearGradient><linearGradient id="SVGPGjVKcCp" x1="128.88" x2="28.7" y1="37.88" y2="84.64" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#0ebc5f"/><stop offset=".85" stop-color="#78c9ff"/></linearGradient></defs></g>',
    },
    'google-maps': {
      viewBox: '0 0 92.3 132.3',
      body: '<path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0C32 0 19.3 6.4 10.8 16.5l21.8 18.3z"/><path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3z"/><path fill="#4285f4" d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7c0 4.3-1.6 8.3-4.2 11.4c0 0 13.9-16.6 27.5-32.7c-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.6-6.3"/><path fill="#fbbc04" d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7c0-4.3 1.5-8.3 4.1-11.3l-28 33.3c4.8 10.6 12.8 19.2 21 29.9l34.1-40.5c-3.3 3.9-8.1 6.3-13.5 6.3"/><path fill="#34a853" d="M59.1 109.2c15.4-24.1 33.3-35 33.3-63c0-7.7-1.9-14.9-5.2-21.3L25.6 98c2.6 3.4 5.3 7.3 7.9 11.3c9.4 14.5 6.8 23.1 12.8 23.1s3.4-8.7 12.8-23.2"/>',
    },
    spotify: {
      viewBox: '0 0 256 256',
      body: '<path fill="#1ed760" d="M128 0C57.308 0 0 57.309 0 128c0 70.696 57.309 128 128 128c70.697 0 128-57.304 128-128C256 57.314 198.697.007 127.998.007l.001-.006Zm58.699 184.614c-2.293 3.76-7.215 4.952-10.975 2.644c-30.053-18.357-67.885-22.515-112.44-12.335a7.98 7.98 0 0 1-9.552-6.007a7.97 7.97 0 0 1 6-9.553c48.76-11.14 90.583-6.344 124.323 14.276c3.76 2.308 4.952 7.215 2.644 10.975m15.667-34.853c-2.89 4.695-9.034 6.178-13.726 3.289c-34.406-21.148-86.853-27.273-127.548-14.92c-5.278 1.594-10.852-1.38-12.454-6.649c-1.59-5.278 1.386-10.842 6.655-12.446c46.485-14.106 104.275-7.273 143.787 17.007c4.692 2.89 6.175 9.034 3.286 13.72zm1.345-36.293C162.457 88.964 94.394 86.71 55.007 98.666c-6.325 1.918-13.014-1.653-14.93-7.978c-1.917-6.328 1.65-13.012 7.98-14.935C93.27 62.027 168.434 64.68 215.929 92.876c5.702 3.376 7.566 10.724 4.188 16.405c-3.362 5.69-10.73 7.565-16.4 4.187z"/>',
    },
    codepen: {
      viewBox: '0 0 128 128',
      body: '<g fill="currentColor"><path d="m125.571 39.926l-58.5-39c-1.997-1.23-4.128-1.24-6.142 0l-58.5 39C.929 40.926 0 42.712 0 44.497v39c0 1.786.929 3.572 2.429 4.571l58.5 39.006c1.996 1.229 4.128 1.24 6.142 0l58.5-39.006c1.5-.999 2.429-2.785 2.429-4.57v-39c0-1.786-.929-3.572-2.429-4.572m-56.07-24.144l43.07 28.715l-19.214 12.858L69.5 41.425V15.784zm-11.001 0v25.644L34.642 57.354L15.428 44.498zm-47.5 39l13.786 9.215L11 73.212zm47.5 57.43L15.428 83.497L34.642 70.64L58.5 86.569zM64 76.997l-19.428-13l19.428-13l19.428 13zm5.5 35.215V86.569L93.357 70.64l19.214 12.857l-43.07 28.715zm47.5-39l-13.786-9.215L117 54.783z"/></g>',
    },
    codesandbox: {
      viewBox: '0 0 600 600',
      body: '<rect width="600" height="600" rx="132" fill="#151515"/><path fill="#dcff50" fill-rule="evenodd" d="M150 150h299.832v300H150zm269.168 30.682v238.636H180.665V180.682z" clip-rule="evenodd"/>',
    },
    'github-gist': {
      viewBox: '0 0 1024 1024',
      body: '<path fill="currentColor" fill-rule="evenodd" d="M512 0C229.12 0 0 229.12 0 512c0 226.56 146.56 417.92 350.08 485.76c25.6 4.48 35.2-10.88 35.2-24.32c0-12.16-.64-52.48-.64-95.36c-128.64 23.68-161.92-31.36-172.16-60.16c-5.76-14.72-30.72-60.16-52.48-72.32c-17.92-9.6-43.52-33.28-.64-33.92c40.32-.64 69.12 37.12 78.72 52.48c46.08 77.44 119.68 55.68 149.12 42.24c4.48-33.28 17.92-55.68 32.64-68.48c-113.92-12.8-232.96-56.96-232.96-252.8c0-55.68 19.84-101.76 52.48-137.6c-5.12-12.8-23.04-65.28 5.12-135.68c0 0 42.88-13.44 140.8 52.48c40.96-11.52 84.48-17.28 128-17.28s87.04 5.76 128 17.28c97.92-66.56 140.8-52.48 140.8-52.48c28.16 70.4 10.24 122.88 5.12 135.68c32.64 35.84 52.48 81.28 52.48 137.6c0 196.48-119.68 240-233.6 252.8c18.56 16 34.56 46.72 34.56 94.72c0 68.48-.64 123.52-.64 140.8c0 13.44 9.6 29.44 35.2 24.32C877.44 929.92 1024 737.92 1024 512C1024 229.12 794.88 0 512 0" clip-rule="evenodd"/>',
    },
    miro: {
      viewBox: '0 0 400 400',
      body: '<g fill="none"><path fill="#fd3" d="M3 100.754C3 46.26 47.244 2 101.754 2h197.492C353.756 2 398 46.244 398 100.754v197.492c0 54.51-44.244 98.754-98.754 98.754H101.754C47.244 397 3 352.756 3 298.246z"/><path fill="#1c1c1e" fill-rule="evenodd" d="M265.573 77.35H229.74l29.889 52.5l-65.723-52.5h-35.834l32.862 64.118l-68.696-64.119H86.404l35.834 81.682l-35.834 163.346h35.834l68.696-174.981l-32.862 174.981h35.834l65.723-186.684l-29.889 186.684h35.833l65.724-204.145l-65.724-40.799z" clip-rule="evenodd"/></g>',
    },
    canva: {
      viewBox: '0 0 80 80',
      body: '<g fill="none"><g clip-path="url(#SVGFqrTtczy)"><path fill="#7d2ae7" d="M40 80c22.091 0 40-17.909 40-40S62.091 0 40 0S0 17.909 0 40s17.909 40 40 40"/><path fill="url(#SVGd8hhpebI)" d="M40 80c22.091 0 40-17.909 40-40S62.091 0 40 0S0 17.909 0 40s17.909 40 40 40"/><path fill="url(#SVGXjE8Ac6X)" d="M40 80c22.091 0 40-17.909 40-40S62.091 0 40 0S0 17.909 0 40s17.909 40 40 40"/><path fill="url(#SVG1MVRi0Vl)" d="M40 80c22.091 0 40-17.909 40-40S62.091 0 40 0S0 17.909 0 40s17.909 40 40 40"/><path fill="url(#SVGlcMqmcyN)" d="M40 80c22.091 0 40-17.909 40-40S62.091 0 40 0S0 17.909 0 40s17.909 40 40 40"/><path fill="#fff" d="M57.27 48.205c-.331 0-.622.279-.924.888c-3.414 6.922-9.31 11.82-16.133 11.82c-7.89 0-12.776-7.122-12.776-16.96c0-16.668 9.286-26.304 17.443-26.304c3.811 0 6.139 2.395 6.139 6.207c0 4.524-2.57 6.919-2.57 8.514c0 .716.445 1.15 1.328 1.15c3.55 0 7.715-4.078 7.715-9.84c0-5.585-4.862-9.691-13.018-9.691c-13.48 0-25.46 12.497-25.46 29.788c0 13.384 7.643 22.23 19.436 22.23c12.517 0 19.754-12.454 19.754-16.497c0-.895-.457-1.305-.935-1.305"/></g><defs><radialGradient id="SVGd8hhpebI" cx="0" cy="0" r="1" gradientTransform="rotate(-49.416 84.778 18.66)scale(61.8733)" gradientUnits="userSpaceOnUse"><stop stop-color="#6420ff"/><stop offset="1" stop-color="#6420ff" stop-opacity="0"/></radialGradient><radialGradient id="SVGXjE8Ac6X" cx="0" cy="0" r="1" gradientTransform="rotate(54.703 1.799 25.019)scale(69.7735)" gradientUnits="userSpaceOnUse"><stop stop-color="#00c4cc"/><stop offset="1" stop-color="#00c4cc" stop-opacity="0"/></radialGradient><radialGradient id="SVG1MVRi0Vl" cx="0" cy="0" r="1" gradientTransform="rotate(-45.195 92.905 16.89)scale(61.1242 28.1118)" gradientUnits="userSpaceOnUse"><stop stop-color="#6420ff"/><stop offset="1" stop-color="#6420ff" stop-opacity="0"/></radialGradient><radialGradient id="SVGlcMqmcyN" cx="0" cy="0" r="1" gradientTransform="rotate(66.52 8.14 30.33)scale(62.9836 105.512)" gradientUnits="userSpaceOnUse"><stop stop-color="#00c4cc" stop-opacity=".726"/><stop offset="0" stop-color="#00c4cc"/><stop offset="1" stop-color="#00c4cc" stop-opacity="0"/></radialGradient><clipPath id="SVGFqrTtczy"><path fill="#fff" d="M0 0h80v80H0z"/></clipPath></defs></g>',
    },
  };

const IMAGE_ICONS: Readonly<Record<string, string>> = {
  desmos: desmosIcon,
};

/** Whether the site has an icon of its own here. */
export function hasSiteIcon(providerId: string): boolean {
  return providerId in VECTOR_ICONS || providerId in IMAGE_ICONS;
}

export function SiteIcon({ providerId, className }: { providerId: string; className?: string }) {
  const image = IMAGE_ICONS[providerId];
  if (image) {
    return (
      <img
        src={image}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn('size-4 shrink-0 rounded-[3px]', className)}
      />
    );
  }
  const icon = VECTOR_ICONS[providerId];
  if (!icon) return null;
  return (
    <svg
      viewBox={icon.viewBox}
      aria-hidden="true"
      focusable="false"
      className={cn('size-4 shrink-0', className)}
      // A fixed table of icons written in this file, never anything typed or
      // received, which is the one case markup can go in this way.
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
