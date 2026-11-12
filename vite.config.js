import {defineConfig} from 'vite';

// Cloudflare Pages provides this SHA for every deployment. The fallback also
// distinguishes local production builds without changing tracked files.
const version=process.env.CF_PAGES_COMMIT_SHA || 'local-'+Date.now().toString(36);

export default defineConfig({
 define:{__MYKIOO_BUILD_VERSION__:JSON.stringify(version)},
 plugins:[{
  name:'mykioo-deployment-version',
  apply:'build',
  generateBundle(){
   this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify({version})});
  }
 }]
});
