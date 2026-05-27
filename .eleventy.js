module.exports = (eleventyConfig) => {
  eleventyConfig.addPassthroughCopy({ '_site-static': '/' });
  return {
    dir: { input: 'src', includes: '_includes', data: '_data', output: '_site' },
    templateFormats: ['njk', 'md', 'html'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
};
