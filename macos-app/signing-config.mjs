// Ad-hoc signatures have no Team ID. Explicitly replace Electron's original
// signature flags rather than retaining library validation from its signature.
export const adHocSignOptions={
  identity:'-',
  identityValidation:false,
  continueOnError:false,
  preAutoEntitlements:false,
  optionsForFile:()=>({
    hardenedRuntime:false,
    signatureFlags:'0',
    timestamp:'none',
    entitlements:[
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.disable-library-validation'
    ]
  })
};
