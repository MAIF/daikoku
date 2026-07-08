import ReactPaginate from 'react-paginate';

// react-paginate ships a Webpack-UMD bundle whose component lives under `.default`
// (`module.exports = { __esModule: true, default: ReactPaginate }`). Vite <=7
// (esbuild) unwrapped that automatically; Vite 8 (Rolldown) does not, exposing the
// wrapper object instead of the component, which crashes rendering with
// "Element type is invalid ... got: object".
//
// Unwrap it once here and import Pagination from this module everywhere instead of
// directly from 'react-paginate', so a single place stays interop-proof.
const Pagination = ((ReactPaginate as any)?.default ?? ReactPaginate) as typeof ReactPaginate;

export default Pagination;
