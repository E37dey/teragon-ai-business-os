# S10.1-B — read the Supabase CLI's OWN access token from Windows Credential
# Manager and emit it on STDOUT for piping into a Node process.
# The value is never displayed, logged or written to disk by this script.
$sig = @'
using System;
using System.Runtime.InteropServices;
public class CredUtil {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags; public uint Type; public string TargetName; public string Comment;
    public long LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  public static string Read(string target) {
    IntPtr p;
    if (!CredReadW(target, 1, 0, out p)) return null;
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      if (c.CredentialBlobSize == 0) return null;
      byte[] b = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, b, 0, (int)c.CredentialBlobSize);
      // The blob may be UTF-8 or UTF-16. Pick whichever decodes to a printable
      // ASCII token; a wrong pick yields high code points and breaks the header.
      string u8 = System.Text.Encoding.UTF8.GetString(b).Trim();
      string u16 = System.Text.Encoding.Unicode.GetString(b).Trim();
      Func<string,bool> ascii = s => {
        if (string.IsNullOrEmpty(s)) return false;
        foreach (char ch in s) if (ch < 0x20 || ch > 0x7E) return false;
        return true;
      };
      if (ascii(u8)) return u8;
      if (ascii(u16)) return u16;
      return null;
    } finally { CredFree(p); }
  }
}
'@
Add-Type -TypeDefinition $sig -Language CSharp | Out-Null
$t = [CredUtil]::Read("Supabase CLI:supabase")
if (-not $t) { exit 1 }
[Console]::Out.Write($t)
