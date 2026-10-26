export type EventAccess = "owner" | "participant" | "none";

export type EventPermissions = {
  view: boolean;
  addRecord: boolean;
  editCore: boolean;
  delete: boolean;
  manageParticipants: boolean;
  changeStatus: boolean;
};

export function permissionsFor(access: EventAccess): EventPermissions {
  const member = access === "owner" || access === "participant";
  const owner = access === "owner";
  return {
    view: member,
    addRecord: member,
    editCore: owner,
    delete: owner,
    manageParticipants: owner,
    changeStatus: owner,
  };
}
