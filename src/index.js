import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('getKey', async (req) => {
  const {key} = req.context.extension.issue;

  return key;
});

export const handler = resolver.getDefinitions();
