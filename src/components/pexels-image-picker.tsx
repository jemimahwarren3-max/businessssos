import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ImagePlus, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPexelsImageSearchEnabledFn, searchPexelsImagesFn } from "@/lib/business.functions";
import type { PexelsPhoto } from "@/lib/pexels.server";
import { readableError } from "@/lib/format";

type PexelsImagePickerProps = {
  query: string;
  selectedUrl: string | null;
  onSelect: (imageUrl: string | null) => void;
};

export function PexelsImagePicker({ query, selectedUrl, onSelect }: PexelsImagePickerProps) {
  const fetchAvailability = useServerFn(getPexelsImageSearchEnabledFn);
  const searchImages = useServerFn(searchPexelsImagesFn);
  const [searchText, setSearchText] = useState(query);
  const [searchedText, setSearchedText] = useState("");
  const [selectedPhotoDetails, setSelectedPhotoDetails] = useState<PexelsPhoto | null>(null);

  useEffect(() => setSearchText(query), [query]);

  const availability = useQuery({
    queryKey: ["pexels-image-search-enabled"],
    queryFn: () => fetchAvailability(),
    staleTime: 60_000,
  });
  const searchMutation = useMutation({
    mutationFn: (searchQuery: string) => searchImages({ data: { query: searchQuery } }),
    onSuccess: (_photos, searchQuery) => setSearchedText(searchQuery),
  });

  if (availability.isError) {
    return (
      <p role="status" className="text-xs text-muted-foreground sm:col-span-2">
        Photo search could not be checked. You can still upload your own image.
      </p>
    );
  }
  if (availability.data !== true) return null;

  const selectedPhoto =
    selectedPhotoDetails?.imageUrl === selectedUrl
      ? selectedPhotoDetails
      : searchMutation.data?.find((photo) => photo.imageUrl === selectedUrl);
  const showingResults = searchMutation.data !== undefined && searchedText === searchText.trim();

  function search() {
    const term = searchText.trim();
    if (!term) return;
    searchMutation.reset();
    setSearchedText(term);
    searchMutation.mutate(term);
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchText}
          maxLength={100}
          onChange={(event) => {
            setSearchText(event.target.value);
            searchMutation.reset();
            setSearchedText("");
          }}
          placeholder="Search photos by product name"
          aria-label="Pexels photo search"
          className="min-w-52 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={search}
          disabled={!searchText.trim() || searchMutation.isPending}
        >
          {searchMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          Find a photo
        </Button>
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm underline underline-offset-2"
        >
          Photos provided by Pexels
        </a>
      </div>

      {searchMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {readableError(searchMutation.error, "Pexels photo search failed. Please try again.")}
        </p>
      ) : null}

      {selectedUrl ? (
        <div className="flex items-center gap-3 rounded-md border p-2">
          <img
            src={selectedUrl}
            alt={selectedPhoto?.alt || "Selected Pexels photo"}
            className="size-14 rounded object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Pexels photo selected</p>
            {selectedPhoto?.photographer ? (
              <p className="truncate text-xs text-muted-foreground">
                Photo by {selectedPhoto.photographer}
                {selectedPhoto.photographerUrl ? (
                  <>
                    {" "}
                    on{" "}
                    <a
                      className="underline underline-offset-2"
                      href={selectedPhoto.photographerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Pexels
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove selected Pexels photo"
            onClick={() => {
              setSelectedPhotoDetails(null);
              onSelect(null);
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {showingResults ? (
        searchMutation.data.length > 0 ? (
          <div className="grid grid-cols-3 gap-2" aria-label="Pexels photo results">
            {searchMutation.data.map((photo: PexelsPhoto) => {
              const isSelected = photo.imageUrl === selectedUrl;
              return (
                <div key={photo.id} className="min-w-0 space-y-1">
                  <button
                    type="button"
                    aria-label={`Use photo by ${photo.photographer || "Pexels contributor"}`}
                    aria-pressed={isSelected}
                    className="group relative block w-full overflow-hidden rounded-md border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setSelectedPhotoDetails(photo);
                      onSelect(photo.imageUrl);
                    }}
                  >
                    <img
                      src={photo.imageUrl}
                      alt={photo.alt || `Pexels photo by ${photo.photographer}`}
                      className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/65 px-2 py-1 text-xs text-white">
                      <span className="truncate">{photo.photographer || "Pexels"}</span>
                      {isSelected ? (
                        <Check className="size-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <ImagePlus className="size-4 shrink-0" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Photo by{" "}
                    {photo.photographerUrl ? (
                      <a
                        href={photo.photographerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {photo.photographer || "contributor"}
                      </a>
                    ) : (
                      photo.photographer || "contributor"
                    )}{" "}
                    on{" "}
                    <a
                      href="https://www.pexels.com"
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      Pexels
                    </a>
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            No Pexels photos found for that search.
          </p>
        )
      ) : null}
    </div>
  );
}
