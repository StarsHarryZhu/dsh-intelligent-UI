/**
 * The libraries this plugin ships, and which code-host addresses they answer.
 *
 * A widget names a library the way it would anywhere: by its address on a code
 * host, such as cdnjs or jsDelivr. When that address names a library and major
 * version this plugin ships, the frame loads the shipped copy instead, so the
 * widget works offline and without reaching the host at all; any other address
 * is loaded from the code host, as the frame's policy allows. Each library is
 * one lazily loaded file of the browser half, `client.lib-<id>.js`, fetched only
 * when a widget asks for it. The files and their provenance are pinned in
 * `vendor/manifest.json`.
 * @module dsh-intelligent-ui/widget/libs
 */
/** How the frame loads one shipped file. */
export type LibraryKind = 'script' | 'style' | 'module';
/** One library this plugin ships. */
export interface Library {
    /** Short id, which names its lazily loaded file. */
    id: string;
    /** Name and version line, as the tool description and the tool result name it. */
    title: string;
    /** One address the tool description shows for it. */
    example: string;
    /** Package names on jsDelivr, unpkg, and esm.sh. */
    npm: readonly string[];
    /** Library names on cdnjs. */
    cdnjs: readonly string[];
    /** Major versions the shipped copy stands in for; an address without a version also matches. */
    majors: readonly number[];
    /**
     * The shipped file an address's path asks for.
     * @param path - the path inside the package, lowercased, without a leading slash; '' for the package's main file.
     * @param host - which code host the address names.
     * @returns the file name inside this library's lazy file, how it loads, and the bare names a
     *   module of it is imported by; undefined when it ships no such file.
     */
    pick(path: string, host: CodeHost): Picked | undefined;
}
/** One shipped file an address asks for. */
export interface Picked {
    file: string;
    kind: LibraryKind;
    /** Bare names a module of this file is imported by, such as `three`. */
    aliases?: readonly string[];
}
/** The code hosts whose addresses name packages. */
export type CodeHost = 'cdnjs' | 'jsdelivr' | 'unpkg' | 'esm';
/** An address read as a package request. */
export interface PackageRequest {
    host: CodeHost;
    name: string;
    /** The major version asked for, or undefined for the latest or an unversioned address. */
    major: number | undefined;
    /** The path inside the package, lowercased, without a leading slash. */
    path: string;
}
/**
 * Read an address as a package request on a code host.
 * @param url - an absolute address.
 * @returns the request, or undefined when the address is not one of a package on a known code host.
 */
export declare function readPackageUrl(url: string): PackageRequest | undefined;
/**
 * The libraries this build ships, matched by package name and major version on
 * every code host. Each file named here is one of the library's files in
 * `vendor/manifest.json`, which pins its version and digest; the build writes
 * them into `lib/client.lib-<id>.js`. A major version listed beyond the shipped
 * one is an older release whose interface the shipped one keeps.
 */
export declare const LIBRARIES: readonly Library[];
/** A shipped file that stands in for an address. */
export interface ShippedFile extends Picked {
    library: Library;
}
/**
 * The shipped file an address stands for.
 * @param url - an absolute address from a widget's source.
 * @param libraries - the table to search; the shipped one by default.
 * @returns the file, or undefined when the address is to be loaded from its code host.
 */
export declare function shippedFileFor(url: string, libraries?: readonly Library[]): ShippedFile | undefined;
/**
 * The name of a library's lazily loaded file.
 * @param id - the library id.
 * @returns the file name the host's module loader serves beside `client.js`.
 */
export declare function libraryChunk(id: string): string;
