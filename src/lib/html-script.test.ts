import { serializeForInlineScript } from './html-script';

describe('serializeForInlineScript', () => {
  it('keeps JSON valid while escaping script-breaking characters', () => {
    const serialized = serializeForInlineScript({
      value: '</script><script>e</script>\u2028\u2029',
    });

    expect(serialized).not.toContain('</script>');
    expect(
      JSON.parse(
        serialized
          .replace(/\\u003c/g, '<')
          .replace(/\\u003e/g, '>')
          .replace(/\\u2028/g, '\u2028')
          .replace(/\\u2029/g, '\u2029')
      )
    ).toEqual({
      value: '</script><script>e</script>\u2028\u2029',
    });
  });
});
