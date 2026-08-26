import { useLocation } from "wouter";
import { useEffect } from "react";

export default function EventsList() {
  const [, setLocation] = useLocation();
  
  // Just redirect to Dashboard as it serves as the events list
  useEffect(() => {
    setLocation("/");
  }, [setLocation]);
  
  return null;
}
