import {useEffect,useState} from 'react';

// Keep the current dashboard section in the URL, so refreshing a tab opens that same page.
// Existing links such as ?section=subscription continue to work.
const slug = value => String(value).trim().toLowerCase().replace(/\s+/g, '-');
export function usePageSection(validSections, defaultSection) {
  const getFromUrl = () => {
    const requested = new URLSearchParams(window.location.search).get('section');
    return validSections.find(section => slug(section) === slug(requested || '')) || defaultSection;
  };
  const [section, setSection] = useState(getFromUrl);

  useEffect(() => {
    const url = new URL(window.location.href);
    const value = slug(section);
    if (url.searchParams.get('section') !== value) {
      url.searchParams.set('section', value);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
  }, [section]);

  useEffect(() => {
    const restorePage = () => setSection(getFromUrl());
    window.addEventListener('popstate', restorePage);
    return () => window.removeEventListener('popstate', restorePage);
  }, []);

  return [section, setSection];
}
