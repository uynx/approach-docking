{ pkgs, ... }:
{
  packages = with pkgs; [ llvmPackages.clang-unwrapped lld cmake ninja boost nodejs python3 git ];
}
